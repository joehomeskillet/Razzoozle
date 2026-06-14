import { useThemeStore } from "@razzia/web/features/theme/store"
import QRCodeStyling, { type Options } from "qr-code-styling"
import { useEffect, useMemo, useRef } from "react"

interface Props {
  value: string
  size: number
  className?: string
}

/**
 * Themed, on-brand QR code (qr-code-styling). Players SCAN this to join, so
 * scannability beats flair: dark-purple rounded dots on a solid white
 * background give strong contrast, error-correction level "M", no center logo.
 *
 * The QRCodeStyling instance is created once (per mount), appended to a
 * container div, then `.update()`d whenever the value, size, or theme colors
 * change — matching the imperative lifecycle the library expects.
 */
const QRCode = ({ value, size, className }: Props) => {
  const { theme } = useThemeStore()
  const ref = useRef<HTMLDivElement>(null)

  const options = useMemo<Options>(
    () => ({
      type: "svg",
      width: size,
      height: size,
      data: value,
      margin: 4,
      qrOptions: { errorCorrectionLevel: "M" },
      dotsOptions: { type: "rounded", color: theme.colorSecondary },
      backgroundOptions: { color: "#ffffff" },
      cornersSquareOptions: {
        type: "extra-rounded",
        color: theme.colorPrimary,
      },
      cornersDotOptions: { color: theme.colorSecondary },
    }),
    [value, size, theme.colorSecondary, theme.colorPrimary],
  )

  const qr = useMemo(() => new QRCodeStyling(options), [])
  // `qr` is intentionally created once; subsequent option changes go through
  // `.update()` below. The eslint-deps lint is satisfied by the empty array
  // semantics of the constructor memo.

  useEffect(() => {
    const container = ref.current
    if (!container) {
      return
    }
    qr.append(container)
    return () => {
      container.replaceChildren()
    }
  }, [qr])

  useEffect(() => {
    qr.update(options)
  }, [qr, options])

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}

export default QRCode
