/**
 * useStickerExport — turns a laid-out <TrophySticker> capture node into a PNG
 * Blob (via modern-screenshot's SVG-foreignObject rasterizer, which survives
 * Tailwind v4 oklch) and runs the cross-platform SHARE WATERFALL.
 *
 * modern-screenshot is imported LAZILY (dynamic `import()`), never statically —
 * it is a sizeable rasterizer and only needed when the user actually shares.
 *
 * Share waterfall (exact order):
 *   L1 — Web Share with files: if `navigator.canShare?.({ files: [file] })`,
 *        call `navigator.share({ files: [file] })` with NO text/title (iOS
 *        WhatsApp drops the image when text + files are combined).
 *   L2 — Desktop clipboard: `navigator.clipboard.write([new ClipboardItem({
 *        "image/png": <Promise<Blob>> })])` — the Blob PROMISE is passed
 *        synchronously so Safari's user-gesture requirement is satisfied.
 *   L3 — Universal download: an <a download> object-URL. ALWAYS works, including
 *        non-secure contexts (bare-IP LAN over http) where canShare/clipboard
 *        are absent.
 *
 * Non-secure-context handling: `navigator.canShare` and `navigator.clipboard`
 * are undefined on http origins, so the waterfall short-circuits straight to the
 * download fallback — which never depends on a secure context.
 */

import { useCallback, useRef, useState } from "react"

// modern-screenshot's domToBlob options (subset we use). Typed locally so this
// file does not statically depend on the package's types.
interface DomToBlobOptions {
  pixelRatio?: number
  backgroundColor?: string
  width?: number
  height?: number
  type?: string
  quality?: number
}

type DomToBlob = (
  node: HTMLElement,
  options?: DomToBlobOptions,
) => Promise<Blob>

/** How the share request was ultimately satisfied. */
export type ShareOutcome = "shared" | "copied" | "downloaded"

export interface ExportStickerOptions {
  /** PNG device-pixel multiplier. Spec default: 2 (540px logical → 1080px). */
  pixelRatio?: number
  /** Opaque background fallback so transparency never yields a black PNG. */
  backgroundColor?: string
  /** Download filename (sans extension). */
  fileName?: string
  /** Skip L1 web-share (e.g. force the download path from a "save image" button). */
  forceDownload?: boolean
}

export interface UseStickerExportApi {
  /** True while rasterizing / sharing — drive a "Dein Sticker wird erstellt" state. */
  isExporting: boolean
  /** Last error, if the most recent export threw (e.g. tainted canvas). */
  error: Error | null
  /**
   * Rasterize `node` to a PNG Blob and run the share waterfall.
   * Resolves with how it was satisfied; rejects only if every tier failed.
   */
  exportSticker: (
    node: HTMLElement,
    options?: ExportStickerOptions,
  ) => Promise<ShareOutcome>
  /**
   * Two-tap helper (generate-then-share): rasterize now (tap 1, while the node
   * is mounted/visible) and stash the Blob; `shareGenerated()` (tap 2) then runs
   * the waterfall against the cached Blob inside a fresh user gesture. Useful
   * where capture is slow and Safari would otherwise lose the gesture.
   */
  generateSticker: (
    node: HTMLElement,
    options?: ExportStickerOptions,
  ) => Promise<Blob>
  shareGenerated: (options?: ExportStickerOptions) => Promise<ShareOutcome>
  /** True once `generateSticker` has produced a Blob ready for `shareGenerated`. */
  hasGenerated: boolean
}

const DEFAULT_PIXEL_RATIO = 2
const DEFAULT_FILE_NAME = "razzoozle-trophy"

/** Lazy, memoized loader for modern-screenshot's domToBlob. */
let _domToBlob: Promise<DomToBlob> | null = null
function loadDomToBlob(): Promise<DomToBlob> {
  if (!_domToBlob) {
    _domToBlob = import("modern-screenshot").then(
      (m) => (m as { domToBlob: DomToBlob }).domToBlob,
    )
  }
  return _domToBlob
}

/** L3 — universal object-URL download. Works in every context, secure or not. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the navigation/download has grabbed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Runs the L1 → L2 → L3 waterfall against an already-rasterized Blob.
 * The Blob promise for clipboard is passed synchronously (Safari gesture quirk).
 */
async function runShareWaterfall(
  blob: Blob,
  fileName: string,
  forceDownload: boolean,
): Promise<ShareOutcome> {
  const downloadName = fileName.endsWith(".png") ? fileName : `${fileName}.png`
  const file = new File([blob], downloadName, { type: "image/png" })

  // L1 — Web Share with files (mobile / PWA). NO text/title (iOS WhatsApp quirk).
  if (
    !forceDownload &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ files: [file] })
      return "shared"
    } catch (err) {
      // User cancelled — respect it, do NOT fall through to download/clipboard.
      if (err instanceof Error && err.name === "AbortError") {
        throw err
      }
      // Any other share failure falls through to clipboard / download.
    }
  }

  // L2 — Desktop clipboard. Pass the Blob PROMISE synchronously (Safari gesture).
  if (
    !forceDownload &&
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": Promise.resolve(blob) }),
      ])
      return "copied"
    } catch {
      // Fall through to the universal download.
    }
  }

  // L3 — universal download (also the only path on non-secure / bare-IP LAN).
  downloadBlob(blob, downloadName)
  return "downloaded"
}

/** Rasterizes `node` → PNG Blob at the given pixelRatio (modern-screenshot). */
async function rasterize(
  node: HTMLElement,
  options: ExportStickerOptions | undefined,
): Promise<Blob> {
  const domToBlob = await loadDomToBlob()
  return domToBlob(node, {
    pixelRatio: options?.pixelRatio ?? DEFAULT_PIXEL_RATIO,
    backgroundColor: options?.backgroundColor,
    type: "image/png",
  })
}

export function useStickerExport(): UseStickerExportApi {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)

  // Cached Blob + the options it was generated with (for the two-tap pattern).
  const generatedRef = useRef<{
    blob: Blob
    options?: ExportStickerOptions
  } | null>(null)

  const exportSticker = useCallback(
    async (
      node: HTMLElement,
      options?: ExportStickerOptions,
    ): Promise<ShareOutcome> => {
      setIsExporting(true)
      setError(null)
      try {
        const blob = await rasterize(node, options)
        return await runShareWaterfall(
          blob,
          options?.fileName ?? DEFAULT_FILE_NAME,
          options?.forceDownload ?? false,
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        // A user-cancelled share is not a real failure — surface it but don't toast.
        if (e.name !== "AbortError") setError(e)
        throw e
      } finally {
        setIsExporting(false)
      }
    },
    [],
  )

  const generateSticker = useCallback(
    async (
      node: HTMLElement,
      options?: ExportStickerOptions,
    ): Promise<Blob> => {
      setIsExporting(true)
      setError(null)
      try {
        const blob = await rasterize(node, options)
        generatedRef.current = { blob, options }
        setHasGenerated(true)
        return blob
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        throw e
      } finally {
        setIsExporting(false)
      }
    },
    [],
  )

  const shareGenerated = useCallback(
    async (options?: ExportStickerOptions): Promise<ShareOutcome> => {
      const cached = generatedRef.current
      if (!cached) {
        throw new Error("No sticker generated yet — call generateSticker first")
      }
      const merged = { ...cached.options, ...options }
      setIsExporting(true)
      setError(null)
      try {
        return await runShareWaterfall(
          cached.blob,
          merged.fileName ?? DEFAULT_FILE_NAME,
          merged.forceDownload ?? false,
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        if (e.name !== "AbortError") setError(e)
        throw e
      } finally {
        setIsExporting(false)
      }
    },
    [],
  )

  return {
    isExporting,
    error,
    exportSticker,
    generateSticker,
    shareGenerated,
    hasGenerated,
  }
}

export default useStickerExport
