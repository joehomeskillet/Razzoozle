import { useEffect, useRef } from "react"
import QRCode from "qr-code-styling"

interface SchuelerStudent {
  id: number
  displayName: string
  classes: Array<{ id: number; name: string }>
}

interface PinView {
  studentId: number
  pin: string
  labels: string[]
  symbols?: string[]
}

interface PrintSheetsProps {
  students: SchuelerStudent[]
  pins: Map<number, PinView>
  loginUrl: string
}

const PrintSheets = ({ students, pins, loginUrl }: PrintSheetsProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="print-only" style={{ display: "none" }}>
      {students.map((student) => {
        const pinView = pins.get(student.id)
        const className = student.classes[0]?.name ?? ""

        return (
          <div
            key={student.id}
            className="print-sheet w-full"
            style={{
              breakAfter: "page",
              pageBreakAfter: "always",
              width: "210mm",
              height: "297mm",
              padding: "20mm",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              fontFamily: "sans-serif",
            }}
          >
            {/* Header */}
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
                {student.displayName}
              </h1>
              <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0 0" }}>
                {className}
              </p>
            </div>

            {/* PIN Section */}
            {pinView && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#999", margin: "0 0 8px 0" }}>
                    Zugangscode
                  </p>
                  <div
                    style={{
                      fontSize: "32px",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      letterSpacing: "8px",
                      display: "flex",
                      gap: "4px",
                    }}
                  >
                    {pinView.symbols && pinView.symbols.length === 4
                      ? pinView.symbols.map((emoji, i) => (
                          <span key={i} style={{ width: "48px", textAlign: "center" }}>
                            {emoji}
                          </span>
                        ))
                      : pinView.pin.split("").map((char, i) => (
                          <span key={i} style={{ width: "32px", textAlign: "center" }}>
                            {char}
                          </span>
                        ))}
                  </div>
                </div>

                {/* Confidentiality Notice */}
                <p style={{ fontSize: "10px", color: "#999", fontStyle: "italic", margin: 0 }}>
                  Vertraulich: Bitte den Zugangscode nicht weitergeben.
                </p>
              </div>
            )}

            {/* QR Code */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "120px",
              }}
            >
              <QRCodeCanvas url={loginUrl} />
            </div>

            {/* Login URL */}
            <div style={{ borderTop: "1px solid #ddd", paddingTop: "12px" }}>
              <p style={{ fontSize: "10px", color: "#999", margin: 0, wordBreak: "break-all" }}>
                {loginUrl}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface QRCodeCanvasProps {
  url: string
}

const QRCodeCanvas = ({ url }: QRCodeCanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !url) return

    try {
      const qr = new QRCode({
        width: 200,
        height: 200,
        type: "canvas",
        margin: 0,
        data: url,
        background: "#ffffff",
        color: "#000000",
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      canvasRef.current.innerHTML = ""
      qr.append(canvasRef.current)
    } catch (err) {
      console.error("QR Code generation failed:", err)
      canvasRef.current!.innerHTML = '<div style="color:red">QR Error</div>'
    }
  }, [url])

  return (
    <div
      ref={canvasRef}
      style={{ width: "200px", height: "200px" }}
      aria-label={`QR Code für Login: ${url}`}
      role="img"
    />
  )
}

export default PrintSheets
