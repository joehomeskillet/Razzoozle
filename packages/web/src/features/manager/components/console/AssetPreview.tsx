import clsx from "clsx"
import { Image as ImageIcon, LoaderCircle, Upload } from "lucide-react"
import { type ChangeEvent, type ReactNode, useEffect, useState } from "react"
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
}: AssetPreviewProps) => {
  const { t } = useTranslation()
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

    if (!file) {
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
    <div className={clsx("flex flex-col gap-2", className)}>
      <div
        className={clsx(
          "relative w-full overflow-hidden rounded-xl bg-gray-50 outline-1 -outline-offset-1 outline-gray-200",
          aspect,
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
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-gray-400">
            <ImageIcon className="size-7" aria-hidden />
            <span className="text-xs font-medium">{defaultLabel}</span>
          </div>
        )}
        {showImage && overlay}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {label}
          </p>
          {hint && <p className="truncate text-sm text-gray-500">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/*
            Button-look <label> + hidden input — mirrors the shared
            <Button variant="primary"> surface (accent-contrast clears AA on
            white) with an AA focus ring; the native control keeps a11y.
          */}
          <label
            aria-disabled={uploading}
            className={clsx(
              "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-white shadow-sm transition-colors",
              "bg-[var(--accent-contrast)] hover:brightness-[1.05] active:brightness-[0.95]",
              "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white",
              uploading && "cursor-not-allowed opacity-60",
            )}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {t("manager:theme.upload")}
            <input
              type="file"
              accept={accept}
              className="sr-only"
              disabled={uploading}
              onChange={handleChange}
            />
          </label>
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

      {displayError && (
        <p className="text-sm font-semibold text-red-600" role="alert">
          {displayError}
        </p>
      )}
    </div>
  )
}

export default AssetPreview
