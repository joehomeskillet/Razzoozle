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

interface PrintSummaryProps {
  students: SchuelerStudent[]
  pins: Map<number, PinView>
  className: string
}

const PrintSummary = ({ students, pins, className }: PrintSummaryProps) => {
  return (
    <div
      className="print-summary print-only"
      style={{
        display: "none",
        width: "210mm",
        height: "297mm",
        padding: "20mm",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
          Schüler-Zugangscodes
        </h1>
        <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0 0" }}>
          {className}
        </p>
      </div>

      {/* Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #333" }}>
            <th
              style={{
                textAlign: "left",
                padding: "8px",
                fontWeight: 600,
              }}
            >
              Name
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "8px",
                fontWeight: 600,
              }}
            >
              Zugangscode
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "8px",
                fontWeight: 600,
              }}
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const pinView = pins.get(student.id)
            const displayPin = pinView?.symbols?.join("") ?? pinView?.pin ?? "—"

            return (
              <tr
                key={student.id}
                style={{
                  borderBottom: "1px solid #ddd",
                  backgroundColor: student.id % 2 === 0 ? "#f9f9f9" : "#fff",
                }}
              >
                <td style={{ padding: "8px" }}>{student.displayName}</td>
                <td
                  style={{
                    textAlign: "center",
                    padding: "8px",
                    fontFamily: "monospace",
                    fontWeight: 600,
                  }}
                >
                  {displayPin}
                </td>
                <td style={{ textAlign: "center", padding: "8px" }}>Aktiv</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Footer Note */}
      <div style={{ marginTop: "24px", fontSize: "10px", color: "#999" }}>
        <p style={{ margin: 0 }}>
          Vertraulich: Bitte die Zugangscodes nicht weitergeben.
        </p>
      </div>
    </div>
  )
}

export default PrintSummary
