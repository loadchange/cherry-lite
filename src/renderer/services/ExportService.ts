import { preferenceService } from '@data/PreferenceService'
// Known same-tier soft-edge (inherited from the former utils/export):
// `getTopicMessages` is a non-React data accessor that happens to live in the
// `useTopic` hook module, so this is a service -> hook import. Sinking the
// accessor below the hooks tier is deferred as out of scope here.
import { getTopicMessages } from '@renderer/hooks/useTopic'
import { getProviderLabelKey } from '@renderer/i18n/label'
import i18n from '@renderer/i18n/resolver'
import type { ExportableMessage } from '@renderer/types/messageExport'
import type { Topic } from '@renderer/types/topic'
import { messagesToPlainText, processCitations } from '@renderer/utils/export'
import { convertMathFormula, markdownToPlainText } from '@renderer/utils/markdown'
import { stripCitationMarkers } from '@renderer/utils/message/citations'
import { getComposerTextFromMessage } from '@renderer/utils/message/composerTokens'
import {
  getCitationContent,
  getMainTextContent,
  getThinkingContent,
  getToolCitationExport
} from '@renderer/utils/message/find'
import DOMPurify from 'dompurify'

/**
 * 安全地处理思维链内容，保留安全的 HTML 标签如 <br>，移除危险内容
 *
 * 支持的标签：
 * - 结构：br, p, div, span, h1-h6, blockquote
 * - 格式：strong, b, em, i, u, s, del, mark, small, sup, sub
 * - 列表：ul, ol, li
 * - 代码：code, pre, kbd, var, samp
 * - 表格：table, thead, tbody, tfoot, tr, td, th
 *
 * @param content 原始思维链内容
 * @returns 安全处理后的内容
 */
const sanitizeReasoningContent = (content: string): string => {
  // 先处理换行符转换为 <br>
  const contentWithBr = content.replace(/\n/g, '<br>')

  // 使用 DOMPurify 清理内容，保留常用的安全标签和属性
  return DOMPurify.sanitize(contentWithBr, {
    ALLOWED_TAGS: [
      // 换行和基础结构
      'br',
      'p',
      'div',
      'span',
      // 文本格式化
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'mark',
      'small',
      // 上标下标（数学公式、引用等）
      'sup',
      'sub',
      // 标题
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      // 引用
      'blockquote',
      // 列表
      'ul',
      'ol',
      'li',
      // 代码相关
      'code',
      'pre',
      'kbd',
      'var',
      'samp',
      // 表格（AI输出中可能包含表格）
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      // 分隔线
      'hr'
    ],
    ALLOWED_ATTR: [
      // 安全的通用属性
      'class',
      'title',
      'lang',
      'dir',
      // code 标签的语言属性
      'data-language',
      // 表格属性
      'colspan',
      'rowspan',
      // 列表属性
      'start',
      'type'
    ],
    KEEP_CONTENT: true, // 保留被移除标签的文本内容
    RETURN_DOM: false,
    SANITIZE_DOM: true,
    // 允许的协议（预留，虽然目前没有允许链接标签）
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  })
}

const getRoleText = async (
  role: string,
  modelName?: string,
  providerId?: string,
  author?: { name: string; emoji?: string }
): Promise<string> => {
  const { showModelNameInMarkdown, showModelProviderInMarkdown } = await preferenceService.getMultiple({
    showModelNameInMarkdown: 'data.export.markdown.show_model_name',
    showModelProviderInMarkdown: 'data.export.markdown.show_model_provider'
  })
  if (role === 'user') {
    return '🧑‍💻 User'
  } else if (role === 'system') {
    return '🤖 System'
  } else {
    // Prefer the frozen producing author (survives rename/delete); fall back to the generic label.
    const emoji = author?.emoji || '🤖'
    const authorLabel = author?.name || 'Assistant'
    let assistantText = `${emoji} `
    if (showModelNameInMarkdown && modelName) {
      // Author-first (mirrors the on-screen header); model is secondary when the author is known.
      assistantText += author?.name ? `${authorLabel} | ${modelName}` : modelName
      if (showModelProviderInMarkdown && providerId) {
        const providerDisplayName = i18n.t(getProviderLabelKey(providerId), { defaultValue: providerId })
        assistantText += ` | ${providerDisplayName}`
        return assistantText
      }
      return assistantText
    } else if (showModelProviderInMarkdown && providerId) {
      const providerDisplayName = i18n.t(getProviderLabelKey(providerId), { defaultValue: providerId })
      assistantText += `${authorLabel} | ${providerDisplayName}`
      return assistantText
    }
    return assistantText + authorLabel
  }
}

/**
 * 标准化引用内容为Markdown脚注格式
 * @param citations 引用列表
 * @returns Markdown脚注格式的引用内容
 */
const formatCitationsAsFootnotes = (citations: string): string => {
  if (!citations.trim()) return ''

  // 将引用列表转换为脚注格式
  const lines = citations.split('\n\n')
  const footnotes = lines.map((line) => {
    const match = line.match(/^\[(\d+)\]\s*(.+)/)
    if (match) {
      const [, num, content] = match
      return `[^${num}]: ${content}`
    }
    return line
  })

  return footnotes.join('\n\n')
}

const createBaseMarkdown = async (
  message: ExportableMessage,
  includeReasoning: boolean = false,
  excludeCitations: boolean = false,
  normalizeCitations: boolean = true
): Promise<{ titleSection: string; reasoningSection: string; contentSection: string; citation: string }> => {
  const forceDollarMathInMarkdown = await preferenceService.get('data.export.markdown.force_dollar_math')
  const author = 'messageSnapshot' in message ? message.messageSnapshot : undefined
  // Fall back to the frozen author's model when the projection didn't populate a live `model`
  // (e.g. topic exports), so the model/provider still render when those export prefs are on.
  const model = message.model ?? author?.model
  const roleText = await getRoleText(message.role, model?.name, model?.provider, author)
  const titleSection = `## ${roleText}`
  let reasoningSection = ''

  if (includeReasoning) {
    let reasoningContent = getThinkingContent(message)
    if (reasoningContent) {
      if (reasoningContent.startsWith('<think>\n')) {
        reasoningContent = reasoningContent.substring(8)
      } else if (reasoningContent.startsWith('<think>')) {
        reasoningContent = reasoningContent.substring(7)
      }
      // 使用 DOMPurify 安全地处理思维链内容
      reasoningContent = sanitizeReasoningContent(reasoningContent)
      // The model cites its sources while reasoning too, but the `[N]` numbering below
      // belongs to the answer body — strip rather than resolve, so no internal marker
      // survives and no second, conflicting sequence appears.
      reasoningContent = stripCitationMarkers(reasoningContent)
      if (forceDollarMathInMarkdown) {
        reasoningContent = convertMathFormula(reasoningContent)
      }
      reasoningSection = `<div style="border: 2px solid #dddddd; border-radius: 10px;">
  <details style="padding: 5px;">
    <summary>${i18n.t('common.reasoning_content')}</summary>
    ${reasoningContent}
  </details>
</div>
`
    }
  }

  const rawContent = getComposerTextFromMessage(message, getMainTextContent(message))
  // Tool-derived citations live as `[cite:id]` markers in the text with no persisted
  // reference metadata, so resolve them to plain `[N]` here — otherwise the internal
  // marker leaks into the export and the sources list comes back empty. Messages that
  // do carry reference metadata keep the legacy path (see `getToolCitationExport`).
  const { content, citation: toolCitation } = getToolCitationExport(message, rawContent)
  let citation = excludeCitations ? '' : getCitationContent(message) || toolCitation

  let processedContent = forceDollarMathInMarkdown ? convertMathFormula(content) : content

  // 处理引用标记
  if (excludeCitations) {
    processedContent = processCitations(processedContent, 'remove')
  } else if (normalizeCitations) {
    processedContent = processCitations(processedContent, 'normalize')
    citation = formatCitationsAsFootnotes(citation)
  }

  return { titleSection, reasoningSection, contentSection: processedContent, citation }
}

export const messageToMarkdown = async (message: ExportableMessage, excludeCitations?: boolean): Promise<string> => {
  const { excludeCitationsInExport, standardizeCitationsInExport } = await preferenceService.getMultiple({
    excludeCitationsInExport: 'data.export.markdown.exclude_citations',
    standardizeCitationsInExport: 'data.export.markdown.standardize_citations'
  })
  const shouldExcludeCitations = excludeCitations ?? excludeCitationsInExport
  const { titleSection, contentSection, citation } = await createBaseMarkdown(
    message,
    false,
    shouldExcludeCitations,
    standardizeCitationsInExport
  )
  return [titleSection, '', contentSection, citation].join('\n')
}

export const messageToMarkdownWithReasoning = async (
  message: ExportableMessage,
  excludeCitations?: boolean
): Promise<string> => {
  const { excludeCitationsInExport, standardizeCitationsInExport } = await preferenceService.getMultiple({
    excludeCitationsInExport: 'data.export.markdown.exclude_citations',
    standardizeCitationsInExport: 'data.export.markdown.standardize_citations'
  })
  const shouldExcludeCitations = excludeCitations ?? excludeCitationsInExport
  const { titleSection, reasoningSection, contentSection, citation } = await createBaseMarkdown(
    message,
    true,
    shouldExcludeCitations,
    standardizeCitationsInExport
  )
  return [titleSection, '', reasoningSection, contentSection, citation].join('\n')
}

export const messagesToMarkdown = async (
  messages: ExportableMessage[],
  exportReasoning?: boolean,
  excludeCitations?: boolean
): Promise<string> => {
  const converter = exportReasoning ? messageToMarkdownWithReasoning : messageToMarkdown
  const markdowns = await Promise.all(messages.map((message) => converter(message, excludeCitations)))
  return markdowns.join('\n---\n')
}

export const topicToMarkdown = async (
  topic: Topic,
  exportReasoning?: boolean,
  excludeCitations?: boolean
): Promise<string> => {
  const topicName = `# ${topic.name}`

  const messages = await getTopicMessages(topic.id)

  if (messages && messages.length > 0) {
    return topicName + '\n\n' + (await messagesToMarkdown(messages, exportReasoning, excludeCitations))
  }

  return topicName
}

export const topicToPlainText = async (topic: Topic): Promise<string> => {
  const topicName = markdownToPlainText(topic.name).trim()

  const topicMessages = await getTopicMessages(topic.id)

  if (topicMessages && topicMessages.length > 0) {
    return topicName + '\n\n' + messagesToPlainText(topicMessages)
  }

  return topicName
}
