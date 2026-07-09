import { Button, Card } from "@razzoozle/web"

export const LobbyCard = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <Card>
      <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
        Capitals of Europe
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563" }}>
        12 questions · 4 players waiting
      </p>
      <Button variant="primary">Start game</Button>
    </Card>
  </div>
)

export const CompactCard = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <Card className="max-w-64 p-4">
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>PIN: 482 913</p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#4b5563" }}>
        Join at razzoozle.xyz
      </p>
    </Card>
  </div>
)
