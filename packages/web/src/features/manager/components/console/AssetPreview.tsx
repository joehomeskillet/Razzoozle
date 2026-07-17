import clsx from "clsx"
import { Image as ImageIcon, LoaderCircle, Upload } from "lucide-react"
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"

// Match the server's hard cap in saveBackgroundImage so we reject oversized
// files client-side before pushing megabytes over the socket (mirrors
// ConfigTheme's MAX_UPLOAD_BYTES guard).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export interface AssetPreviewProps {
  /** Visible label, also used as the `<img alt>`. */
  label: string
  /** Theme asset path, used verbatim as `<img src>` (no URL building). */
  value: string | null
  /** Image fit; `cover` for wallpapers, `contain` for transparent logos. */
  fit?: "cover" | "contain"
  /** Tailwind aspect class for the tile (e.g. `aspect-video`). */
  aspect?: string
  /** `accept` list passed to the file input (server transcodes anyway). */
  accept: string
  /** Upload in flight → spinner + disabled control. */
  uploading?: boolean
  /** Externally-supplied (e.g. server) error, shown under the controls. */
  error?: string
  /** Small caption under the label (e.g. dimension hint). */
  hint?: string
  /** Fired with the chosen file once it passes the size guard. */
  onUpload: (file: File) => void
  /** When present + a value is set, render a reset → "Standard" action. */
  onReset?: () => void
  /** Text on the null/placeholder tile (e.g. t('manager:theme.default')). */
  defaultLabel: string
  className?: string
  /** Optional overlay rendered inside the tile, on top of a shown image. */
  overlay?: ReactNode
  /** When true, dim the card + block the upload control (e.g. animated bg active). */
  disabled?: boolean
  /** When true, render a visibly smaller/compact thumbnail tile. */
  compact?: boolean
  /** When true, suppress the visible caption `<p>` (label still used as `<img alt>`). */
  hideLabel?: boolean
}

/**
 * A fixed-aspect asset preview tile + upload/reset controls (spec §A1, the
 * headline deliverable). Renders `value` verbatim as `<img src>`; a missing
 * value (or an `onError` from a deleted file → nginx 404) degrades to a
 * neutral placeholder tile (icon + `defaultLabel`), never `<img src={null}>`.
 * 8 MiB client size guard mirrors ConfigTheme's check. Presentational bar the
 * size-guard message; all strings/handlers are passed in.
 */
const AssetPreview = ({
  label,
  value,
  fit = "cover",
  aspect = "aspect-video",
  accept,
  uploading = false,
  error,
  hint,
  onUpload,
  onReset,
  defaultLabel,
  className,
  overlay,
  disabled = false,
  compact = false,
  hideLabel = false,
}: AssetPreviewProps) => {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  // Swap to the placeholder when the hosted file fails to load (e.g. 404).
  const [imageFailed, setImageFailed] = useState(false)
  // Local oversize guard message, separate from the parent's `error`.
  const [sizeError, setSizeError] = useState<string | null>(null)

  // A new value clears any stale load failure.
  useEffect(() => {
    setImageFailed(false)
  }, [value])

  const showImage = value != null && !imageFailed
  const displayError = error ?? sizeError ?? undefined

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Allow re-selecting the same file after an error.
    e.target.value = ""

    if (!file || disabled) {
      return
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setSizeError(t("errors:theme.imageTooLarge"))

      return
    }

    setSizeError(null)
    onUpload(file)
  }

  return (
    <div
      className={clsx(
        "flex flex-col gap-2",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div
        className={clsx(
          "relative w-full overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface-2)] outline-1 -outline-offset-1 outline-[var(--line)]",
          aspect,
          compact && "max-h-28",
        )}
      >
        {showImage ? (
          <img
            src={value as string}
            alt={label}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className={clsx(
              "size-full",
              fit === "contain" ? "object-contain" : "object-cover",
            )}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-[var(--ink-faint)]">
            <ImageIcon className={clsx(compact ? "size-5" : "size-7")} aria-hidden />
            <span className={clsx("font-medium", compact ? "text-[0.625rem]" : "text-xs")}>
              {defaultLabel}
            </span>
          </div>
        )}
        {showImage && overlay}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {!hideLabel && (
            <p className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
              {label}
            </p>
          )}
          {hint && <p className="truncate text-sm text-[var(--ink-subtle)]">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || disabled}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {t("manager:theme.upload")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={uploading || disabled}
            onChange={handleChange}
          />
          {onReset && value != null && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={onReset}
            >
              {t("manager:console.resetAsset", { defaultValue: "Zurücksetzen" })}
            </Button>
          )}
        </div>
      </div>

      {disabled && (
        <p className="text-sm font-medium text-[var(--ink-subtle)]">
          {t("manager:theme.animatedBg.uploadDisabled", {
            defaultValue: "Animierter Hintergrund aktiv",
          })}
        </p>
      )}

      {displayError && (
        <p className="text-sm font-semibold text-[var(--state-wrong)]" role="alert">
          {displayError}
        </p>
      )}
    </div>
  )
}

export default AssetPreview
