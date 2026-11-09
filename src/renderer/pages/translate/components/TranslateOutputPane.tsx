import { Scrollbar } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { toast } from '@renderer/services/toast'
import { Check, Copy, Image } from 'lucide-react'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import IconButton from './IconButton'

type Props = {
  ref?: Ref<HTMLDivElement>
  translatedContent: string
  renderedMarkdown: string
  enableMarkdown: boolean
  translating: boolean
  copied: boolean
  onCopy: () => void
  onScroll: () => void
}

const TranslateOutputPane = ({
  ref,
  translatedContent,
  renderedMarkdown,
  enableMarkdown,
  translating,
  copied,
  onCopy,
  onScroll
}: Props) => {
  const { t } = useTranslation()
  const captureRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const revision = useRef(0)
  const mounted = useRef(true)
  const [copyingImage, setCopyingImage] = useState(false)

  useEffect(() => {
    revision.current++
  }, [translatedContent, translating, enableMarkdown, renderedMarkdown])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const copyImage = async () => {
    if (inFlight.current || translating || !translatedContent.trim()) return
    inFlight.current = true
    setCopyingImage(true)
    const expectedRevision = revision.current
    const isCurrent = () => mounted.current && revision.current === expectedRevision
    try {
      const { captureScrollableAsDataUrl, copyImageToClipboard } = await import('@renderer/utils/image')
      if (!isCurrent()) return
      const image = await captureScrollableAsDataUrl(captureRef)
      if (!isCurrent()) return
      if (!image) throw new Error('Translation image capture returned no image')
      await copyImageToClipboard(image)
      if (isCurrent()) toast.success(t('message.copied'))
    } catch (error) {
      if (isCurrent()) {
        loggerService.withContext('TranslateOutputPane').error('Failed to copy translation as image', error as Error)
        toast.error(t('common.copy_failed'))
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setCopyingImage(false)
    }
  }

  return (
    <div
      data-ui="translate.output"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Scrollbar
        ref={ref}
        onScroll={onScroll}
        className="selectable min-h-0 flex-1 overflow-x-hidden p-4 pr-12 text-base leading-relaxed">
        <div ref={captureRef} className="flex min-h-full flex-col bg-background p-2 text-foreground">
          {translating && !translatedContent ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span>{t('translate.processing')}</span>
            </div>
          ) : translatedContent ? (
            enableMarkdown ? (
              <div className="markdown" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : (
              <div className="wrap-break-word whitespace-pre-wrap text-foreground">{translatedContent}</div>
            )
          ) : null}
        </div>
      </Scrollbar>
      <div className="absolute top-4 right-3 flex">
        <IconButton
          size="sm"
          onClick={() => void copyImage()}
          disabled={translating || !translatedContent.trim() || copyingImage}
          aria-label={t('preview.copy.image')}
          aria-busy={copyingImage}>
          <Image size={14} />
        </IconButton>
        <IconButton size="sm" onClick={onCopy} disabled={!translatedContent} aria-label={t('common.copy')}>
          {copied ? <Check size={14} className="text-foreground" /> : <Copy size={14} />}
        </IconButton>
      </div>
      <div className="flex shrink-0 items-center px-3 py-4">
        {translatedContent && <span className="text-foreground-tertiary text-xs">{translatedContent.length}</span>}
      </div>
    </div>
  )
}

export default TranslateOutputPane
