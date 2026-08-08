import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Scrollbar
} from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { ProviderAvatarPrimitive } from '@renderer/components/ProviderAvatar'
import ProviderLogoPicker from '@renderer/components/ProviderLogoPicker'
import { toast } from '@renderer/services/toast'
import { checkEntityImageSize } from '@renderer/utils/image'
import { generateColorFromChar, getForegroundColor } from '@renderer/utils/style'
import { uuid } from '@renderer/utils/uuid'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import type { ApiKeyEntry } from '@shared/data/types/provider'
import { Eye, EyeOff, ImagePlus, RotateCcw } from 'lucide-react'
import { type ChangeEvent, type ReactNode, type Ref, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ProviderSettingsDrawer from '../primitives/ProviderSettingsDrawer'
import {
  buildCustomProviderCreationPayload,
  buildCustomProviderEndpointPreview,
  CUSTOM_PROVIDER_TEXT_ENDPOINTS,
  type CustomProviderCreationInvalidUrl,
  type CustomProviderEndpoint,
  type CustomProviderEndpointUrls,
  type CustomProviderTextEndpoint,
  findInvalidCustomProviderCreationUrl
} from './customProviderCreation'
import type { ProviderEditorMode, SubmitProviderEditorParams } from './useProviderEditor'

const logger = loggerService.withContext('ProviderEditorDrawer')

type ProviderEditorSubmit = SubmitProviderEditorParams

const COMMON_CUSTOM_PROVIDER_ENDPOINTS = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES
] as const

const ADDITIONAL_CUSTOM_PROVIDER_ENDPOINTS = [
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  ENDPOINT_TYPE.OPENAI_IMAGE_EDIT
] as const

interface ProviderEditorDrawerProps {
  open: boolean
  mode: ProviderEditorMode | null
  initialLogo?: string
  onClose: () => void
  onSubmit: (providerInput: ProviderEditorSubmit) => Promise<void>
}

export default function ProviderEditorDrawer({
  open,
  mode,
  initialLogo,
  onClose,
  onSubmit
}: ProviderEditorDrawerProps) {
  const { t } = useTranslation()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const firstTextEndpointRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [moreEndpointsOpen, setMoreEndpointsOpen] = useState(false)
  const [endpointUrls, setEndpointUrls] = useState<CustomProviderEndpointUrls>({})
  const [preferredChatEndpoint, setPreferredChatEndpoint] = useState<CustomProviderTextEndpoint>(
    ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
  )
  const [invalidCreationUrl, setInvalidCreationUrl] = useState<CustomProviderCreationInvalidUrl | null>(null)
  // `logo` is the preview value only (a preset id / url / object URL for a
  // staged upload). When the user uploads, `stagedFile` holds the raw file whose
  // bytes are sent to `provider.set_logo` on save; a preset/clear leaves it null.
  const [logo, setLogo] = useState<string | null>(null)
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [logoDirty, setLogoDirty] = useState(false)
  const [logoPickerOpen, setLogoPickerOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const previousOpenRef = useRef(false)
  // Object URL backing the upload preview; revoked when it's replaced or the
  // component unmounts so blobs don't leak.
  const previewObjectUrlRef = useRef<string | null>(null)

  const revokePreviewObjectUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }

  useEffect(() => () => revokePreviewObjectUrl(), [])

  const editingProvider = mode?.kind === 'edit' ? mode.provider : null

  // Reset form state every time the drawer transitions closed→open. Keys off
  // the mode so reopening in a different mode reseeds cleanly.
  useEffect(() => {
    const wasOpen = previousOpenRef.current
    previousOpenRef.current = open

    if (!open || wasOpen) {
      return
    }

    setName(editingProvider?.name ?? '')
    setNameTouched(false)
    setApiKey('')
    setMoreEndpointsOpen(false)
    setEndpointUrls({})
    setPreferredChatEndpoint(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS)
    setInvalidCreationUrl(null)
    setLogoDirty(false)
    setLogoPickerOpen(false)
    revokePreviewObjectUrl()
    setStagedFile(null)
  }, [open, editingProvider])

  useEffect(() => {
    if (!open || logoDirty) {
      return
    }

    setLogo(initialLogo ?? null)
  }, [initialLogo, logoDirty, open])

  const previewName = name.trim()
  const avatarBackgroundColor = useMemo(
    () => (previewName ? generateColorFromChar(previewName) : undefined),
    [previewName]
  )
  const avatarForegroundColor = useMemo(
    () => (avatarBackgroundColor ? getForegroundColor(avatarBackgroundColor) : undefined),
    [avatarBackgroundColor]
  )

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const sizeError = checkEntityImageSize(file)
    if (sizeError) {
      toast.error(sizeError)
      return
    }

    // Stage the raw file + preview it via an object URL (revoking any previous
    // one); the bytes are sent to `provider.set_logo` on save. The renderer no
    // longer pre-creates a file_entry, so a bad upload only surfaces on save.
    revokePreviewObjectUrl()
    previewObjectUrlRef.current = URL.createObjectURL(file)
    setLogo(previewObjectUrlRef.current)
    setStagedFile(file)
    setLogoDirty(true)
  }

  const handleEndpointUrlChange = (endpointType: CustomProviderEndpoint, value: string) => {
    const nextEndpointUrls = { ...endpointUrls, [endpointType]: value }
    setEndpointUrls(nextEndpointUrls)
    if (CUSTOM_PROVIDER_TEXT_ENDPOINTS.some((type) => type === endpointType)) {
      const textEndpoint = endpointType as CustomProviderTextEndpoint
      const configuredTextEndpoints = CUSTOM_PROVIDER_TEXT_ENDPOINTS.filter((type) => nextEndpointUrls[type]?.trim())
      if (configuredTextEndpoints.length === 1 && configuredTextEndpoints[0] === textEndpoint) {
        setPreferredChatEndpoint(textEndpoint)
      } else if (!nextEndpointUrls[preferredChatEndpoint]?.trim()) {
        setPreferredChatEndpoint(configuredTextEndpoints[0] ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS)
      }
    }
    setInvalidCreationUrl(null)
  }

  const buildSubmit = (): ProviderEditorSubmit | null => {
    const trimmedName = name.trim()
    if (!trimmedName || !mode) return null

    // A staged upload sends its bytes via `provider.set_logo`; a picked icon is a
    // preset key; a reset restores the default. Not dirty → unchanged (the field is omitted).
    const logoEdit: SubmitProviderEditorParams['logo'] = stagedFile
      ? { kind: 'image', file: stagedFile }
      : logoDirty
        ? logo
          ? { kind: 'key', key: logo }
          : { kind: 'default' }
        : undefined
    const logoField = logoEdit ? { logo: logoEdit } : {}

    if (mode.kind === 'edit') {
      return {
        mode: 'edit',
        name: trimmedName,
        defaultChatEndpoint: mode.provider.defaultChatEndpoint ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        ...logoField
      }
    }

    const trimmedApiKey = apiKey.trim()
    const apiKeysPayload: ApiKeyEntry[] | undefined = trimmedApiKey
      ? [{ id: uuid(), key: trimmedApiKey, isEnabled: true }]
      : undefined

    const creationPayload = buildCustomProviderCreationPayload({
      endpointUrls,
      preferredChatEndpoint
    })
    return {
      mode: 'create',
      name: trimmedName,
      ...creationPayload,
      authConfig: { type: 'api-key' },
      apiKeys: apiKeysPayload,
      ...logoField
    }
  }

  // Validation surfaces inline beneath each field (see showNameError /
  // showBaseUrlError) rather than by disabling the button, so the button only
  // gates on having an active mode and not already submitting.
  const submittable = Boolean(mode)

  const showNameError = nameTouched && !name.trim()

  const handleSubmit = async () => {
    setNameTouched(true)
    if (mode?.kind === 'create-custom') {
      const invalidUrl = findInvalidCustomProviderCreationUrl({
        endpointUrls,
        preferredChatEndpoint
      })
      setInvalidCreationUrl(invalidUrl)
      if (invalidUrl) {
        if (invalidUrl.field === 'textEndpointRequired') {
          firstTextEndpointRef.current?.focus()
        }
        if (
          invalidUrl.field === 'endpointUrl' &&
          ADDITIONAL_CUSTOM_PROVIDER_ENDPOINTS.some((endpointType) => endpointType === invalidUrl.endpointType)
        ) {
          setMoreEndpointsOpen(true)
        }
        return
      }
    }
    const payload = buildSubmit()
    if (!payload) return

    setIsSubmitting(true)
    try {
      await onSubmit(payload)
    } catch (error) {
      logger.error('Provider editor submit failed', error as Error)
      toast.error(t('settings.provider.save_failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = (() => {
    if (!mode) return t('settings.provider.add.title')
    if (mode.kind === 'edit') return t('common.edit')
    return t('settings.provider.create_custom.title')
  })()

  const submitLabel = mode?.kind === 'edit' ? t('common.save') : t('button.add')

  const footerActions = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button disabled={!submittable || isSubmitting} loading={isSubmitting} onClick={() => void handleSubmit()}>
        {submitLabel}
      </Button>
    </div>
  )

  const avatarSection = (
    <AvatarSection
      uploadInputRef={uploadInputRef}
      name={name}
      logo={logo}
      initialLogo={initialLogo}
      logoPickerOpen={logoPickerOpen}
      editingProviderId={editingProvider?.id}
      avatarBackgroundColor={avatarBackgroundColor}
      avatarForegroundColor={avatarForegroundColor}
      onUpload={(event) => handleUploadChange(event)}
      onPick={(providerId) => {
        revokePreviewObjectUrl()
        setStagedFile(null)
        setLogo(`icon:${providerId}`)
        setLogoDirty(true)
        setLogoPickerOpen(false)
      }}
      onReset={() => {
        revokePreviewObjectUrl()
        setStagedFile(null)
        setLogo(null)
        setLogoDirty(true)
      }}
      onLogoPickerOpenChange={setLogoPickerOpen}
    />
  )

  const nameField = (
    <NameField
      name={name}
      showError={showNameError}
      onNameChange={setName}
      onBlur={() => setNameTouched(true)}
      onEnter={handleSubmit}
      disableEnter={isSubmitting}
    />
  )
  const customAdditionalConfiguredCount = ADDITIONAL_CUSTOM_PROVIDER_ENDPOINTS.filter((endpointType) =>
    endpointUrls[endpointType]?.trim()
  ).length

  const formContent = (
    <div className="flex flex-col gap-5">
      {avatarSection}
      {nameField}

      {mode?.kind === 'create-custom' && (
        <>
          <ApiKeyField value={apiKey} onChange={setApiKey} />
          <CustomProviderEndpointFields
            endpointUrls={endpointUrls}
            preferredChatEndpoint={preferredChatEndpoint}
            invalidUrl={invalidCreationUrl}
            moreOpen={moreEndpointsOpen}
            additionalConfiguredCount={customAdditionalConfiguredCount}
            firstTextEndpointRef={firstTextEndpointRef}
            onMoreOpenChange={setMoreEndpointsOpen}
            onEndpointUrlChange={handleEndpointUrlChange}
            onPreferredChatEndpointChange={setPreferredChatEndpoint}
          />
        </>
      )}
    </div>
  )

  if (mode?.kind === 'edit') {
    return (
      <ProviderSettingsDrawer open={open} onClose={onClose} title={title} footer={footerActions}>
        {formContent}
      </ProviderSettingsDrawer>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onClose()
        }
      }}>
      <DialogContent
        aria-describedby={undefined}
        closeOnOverlayClick={!isSubmitting}
        showCloseButton={!isSubmitting}
        size="lg"
        data-testid="provider-editor-dialog"
        className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-base leading-5">{title}</DialogTitle>
        </DialogHeader>
        <Scrollbar data-testid="provider-editor-scrollbar" className="min-h-0 px-6 py-2">
          {formContent}
        </Scrollbar>
        <DialogFooter className="mt-4 border-border border-t px-6 py-4">{footerActions}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const CUSTOM_PROVIDER_ENDPOINT_LABEL_KEYS: Record<CustomProviderEndpoint, string> = {
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'settings.provider.more_endpoints.openai_chat',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'settings.provider.more_endpoints.openai_responses',
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'settings.provider.more_endpoints.anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'settings.provider.more_endpoints.gemini',
  [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: 'settings.provider.image_endpoints.image_generation_base_url.label',
  [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: 'settings.provider.image_endpoints.image_edit_base_url.label'
}

interface CustomProviderEndpointFieldsProps {
  endpointUrls: CustomProviderEndpointUrls
  preferredChatEndpoint: CustomProviderTextEndpoint
  invalidUrl: CustomProviderCreationInvalidUrl | null
  moreOpen: boolean
  additionalConfiguredCount: number
  firstTextEndpointRef?: Ref<HTMLInputElement>
  onMoreOpenChange: (open: boolean) => void
  onEndpointUrlChange: (endpointType: CustomProviderEndpoint, value: string) => void
  onPreferredChatEndpointChange: (endpointType: CustomProviderTextEndpoint) => void
}

function CustomProviderEndpointFields({
  endpointUrls,
  preferredChatEndpoint,
  invalidUrl,
  moreOpen,
  additionalConfiguredCount,
  firstTextEndpointRef,
  onMoreOpenChange,
  onEndpointUrlChange,
  onPreferredChatEndpointChange
}: CustomProviderEndpointFieldsProps) {
  const { t } = useTranslation()
  const textEndpointRequired = invalidUrl?.field === 'textEndpointRequired'

  const renderEndpointField = (endpointType: CustomProviderEndpoint, labelAccessory?: ReactNode) => {
    const endpointValue = endpointUrls[endpointType] ?? ''
    const invalidEndpoint = invalidUrl?.field === 'endpointUrl' && invalidUrl.endpointType === endpointType
    const missingTextEndpoint = textEndpointRequired && endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
    const requestPreview = buildCustomProviderEndpointPreview(endpointValue, endpointType)
    const emptyValueHelp = CUSTOM_PROVIDER_TEXT_ENDPOINTS.some((type) => type === endpointType)
      ? t('settings.provider.create_custom.endpoint_fields.url_help')
      : t(
          endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION
            ? 'settings.provider.image_endpoints.image_generation_base_url.help'
            : 'settings.provider.image_endpoints.image_edit_base_url.help'
        )

    return (
      <BaseUrlField
        label={t(CUSTOM_PROVIDER_ENDPOINT_LABEL_KEYS[endpointType])}
        placeholder={t('settings.provider.base_url.placeholder')}
        value={endpointValue}
        error={
          invalidEndpoint
            ? t('settings.provider.base_url.invalid')
            : missingTextEndpoint
              ? t('settings.provider.create_custom.endpoint_fields.text_endpoint_required')
              : undefined
        }
        description={
          requestPreview
            ? t('settings.provider.create_custom.request_preview', { path: requestPreview })
            : emptyValueHelp
        }
        labelAccessory={labelAccessory}
        inputRef={endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ? firstTextEndpointRef : undefined}
        onChange={(nextValue) => onEndpointUrlChange(endpointType, nextValue)}
      />
    )
  }

  const renderEndpointControl = (endpointType: CustomProviderEndpoint) => {
    const isTextEndpoint = CUSTOM_PROVIDER_TEXT_ENDPOINTS.some((type) => type === endpointType)
    const isConfiguredTextEndpoint = Boolean(isTextEndpoint && endpointUrls[endpointType]?.trim())
    const isPreferredEndpoint = preferredChatEndpoint === endpointType
    const labelAccessory =
      isTextEndpoint && isPreferredEndpoint && isConfiguredTextEndpoint ? (
        <Badge variant="secondary" className="h-5 border-0 px-1.5 py-0 font-normal text-foreground-tertiary text-xs">
          {t('settings.provider.create_custom.endpoint_fields.default_chat')}
        </Badge>
      ) : isConfiguredTextEndpoint ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="before:-top-5 relative h-5 min-h-0 rounded-full px-2 text-xs transition-transform before:absolute before:inset-x-0 before:bottom-0 before:content-[''] active:scale-[0.96]"
          onClick={() => onPreferredChatEndpointChange(endpointType as CustomProviderTextEndpoint)}>
          {t('settings.provider.create_custom.endpoint_fields.set_default_chat')}
        </Button>
      ) : null

    return <div key={endpointType}>{renderEndpointField(endpointType, labelAccessory)}</div>
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="custom-provider-endpoints-title">
      <h3 id="custom-provider-endpoints-title" className="font-medium text-[13px] text-foreground">
        {t('settings.provider.create_custom.endpoint_fields.label')}
      </h3>

      <div className="flex flex-col gap-5">{COMMON_CUSTOM_PROVIDER_ENDPOINTS.map(renderEndpointControl)}</div>

      <Accordion
        type="single"
        collapsible
        value={moreOpen ? 'more-settings' : ''}
        onValueChange={(value) => onMoreOpenChange(value === 'more-settings')}>
        <AccordionItem value="more-settings" className="border-0">
          <AccordionTrigger className="min-h-10 cursor-pointer py-0 font-normal text-muted-foreground text-xs hover:text-foreground disabled:cursor-not-allowed">
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span>{t('settings.provider.create_custom.endpoint_fields.more')}</span>
              {additionalConfiguredCount > 0 && (
                <span className="truncate text-foreground-tertiary">
                  {t('settings.provider.create_custom.endpoint_fields.more_configured', {
                    count: additionalConfiguredCount
                  })}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-5 pt-3 pb-0 text-foreground">
            {ADDITIONAL_CUSTOM_PROVIDER_ENDPOINTS.map(renderEndpointControl)}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}

interface AvatarSectionProps {
  uploadInputRef: React.RefObject<HTMLInputElement | null>
  name: string
  logo: string | null
  initialLogo?: string
  logoPickerOpen: boolean
  editingProviderId?: string
  avatarBackgroundColor?: string
  avatarForegroundColor?: string
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onPick: (providerId: string) => void
  onReset: () => void
  onLogoPickerOpenChange: (open: boolean) => void
}

function AvatarSection({
  uploadInputRef,
  name,
  logo,
  initialLogo,
  logoPickerOpen,
  editingProviderId,
  avatarBackgroundColor,
  avatarForegroundColor,
  onUpload,
  onPick,
  onReset,
  onLogoPickerOpenChange
}: AvatarSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex h-19 w-19 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50"
        style={
          avatarBackgroundColor && avatarForegroundColor
            ? { backgroundColor: avatarBackgroundColor, color: avatarForegroundColor }
            : undefined
        }>
        <ProviderAvatarPrimitive
          providerId={editingProviderId ?? 'provider-editor-preview'}
          providerName={name || 'Provider'}
          logo={logo ?? undefined}
          size={76}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" onClick={() => uploadInputRef.current?.click()}>
          <ImagePlus size={16} />
          {t('settings.general.image_upload')}
        </Button>
        <Popover open={logoPickerOpen} onOpenChange={onLogoPickerOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline">{t('settings.general.avatar.builtin')}</Button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={8} className="w-auto">
            <ProviderLogoPicker onProviderClick={onPick} />
          </PopoverContent>
        </Popover>
        <Button variant="outline" disabled={!logo && !initialLogo} onClick={onReset}>
          <RotateCcw size={16} />
          {t('settings.general.avatar.reset')}
        </Button>
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        onChange={onUpload}
      />
    </div>
  )
}

interface NameFieldProps {
  name: string
  showError: boolean
  onNameChange: (value: string) => void
  onBlur: () => void
  onEnter: () => void
  disableEnter: boolean
}

function NameField({ name, showError, onNameChange, onBlur, onEnter, disableEnter }: NameFieldProps) {
  const { t } = useTranslation()
  const uid = useId()
  const inputId = `${uid}-name-input`
  const errorId = `${uid}-name-error`
  return (
    <Field className="gap-2">
      <FieldLabel required htmlFor={inputId} className="text-[13px] text-foreground">
        {t('settings.provider.add.name.label')}
      </FieldLabel>
      <Input
        id={inputId}
        value={name}
        placeholder={t('settings.provider.add.name.placeholder')}
        maxLength={32}
        aria-invalid={showError}
        aria-describedby={showError ? errorId : undefined}
        onChange={(event) => onNameChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && !disableEnter) {
            onEnter()
          }
        }}
      />
      <FieldError
        id={errorId}
        className="text-xs"
        errors={showError ? [{ message: t('settings.provider.add.name.required') }] : undefined}
      />
    </Field>
  )
}

interface BaseUrlFieldProps {
  label: string
  labelAccessory?: ReactNode
  placeholder: string
  value: string
  onChange: (value: string) => void
  error?: string
  description?: string
  inputRef?: Ref<HTMLInputElement>
}

function BaseUrlField({
  label,
  labelAccessory,
  placeholder,
  value,
  onChange,
  error,
  description,
  inputRef
}: BaseUrlFieldProps) {
  const uid = useId()
  const inputId = `${uid}-url-input`
  const errorId = `${uid}-url-error`
  const descriptionId = `${uid}-url-description`
  return (
    <Field className="gap-2">
      <div className="flex min-h-5 items-center gap-2">
        <FieldLabel htmlFor={inputId} className="text-[13px] text-foreground">
          {label}
        </FieldLabel>
        {labelAccessory}
      </div>
      <Input
        ref={inputRef}
        id={inputId}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
      {description && (
        <p id={descriptionId} aria-live="polite" className="break-all text-muted-foreground text-xs">
          {description}
        </p>
      )}
      <FieldError id={errorId} className="text-xs" errors={error ? [{ message: error }] : undefined} />
    </Field>
  )
}

interface ApiKeyFieldProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Optional first API key for create-flow. Leaving it empty is fine — users
 * who deferred auth can still finish the flow and fill keys on the detail
 * page later. The detail page is the canonical home for key rotation /
 * multi-key / labeling; this drawer only seeds one entry.
 */
function ApiKeyField({ value, onChange }: ApiKeyFieldProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const uid = useId()
  const inputId = `${uid}-api-key-input`

  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={inputId} className="text-[13px] text-foreground">
        {t('settings.provider.api_key.label')}
      </FieldLabel>
      <div className="relative">
        <Input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={t('settings.provider.api_key.placeholder')}
          className="pr-10"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={t(visible ? 'settings.provider.api_key.hide_key' : 'settings.provider.api_key.show_key')}
          onClick={() => setVisible((v) => !v)}
          className="-translate-y-1/2 absolute top-1/2 right-0 text-muted-foreground hover:text-foreground">
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </div>
    </Field>
  )
}
