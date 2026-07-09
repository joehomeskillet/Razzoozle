import { Button, GithubIcon } from "@razzoozle/web"

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button variant="primary">Start game</Button>
    <Button variant="secondary">Preview quiz</Button>
    <Button variant="danger">Delete question</Button>
    <Button variant="ghost">Skip</Button>
  </div>
)

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button variant="primary" size="sm">
      Join
    </Button>
    <Button variant="primary" size="md">
      Join game
    </Button>
    <Button variant="primary" size="lg">
      Join the game
    </Button>
    <Button variant="secondary" size="icon" aria-label="GitHub">
      <GithubIcon />
    </Button>
  </div>
)

export const Disabled = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button variant="primary" disabled>
      Waiting for players…
    </Button>
    <Button variant="secondary" disabled>
      Locked
    </Button>
  </div>
)
