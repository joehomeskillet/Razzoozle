import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TargetTeamVote, TargetTeamChips } from "../TargetTeamVote"
import { filterVoteCandidates, type FlowerTeamView, type TargetVoteSelection } from "../flower-battle.types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

// The default socket-context value creates a real io() client on module
// import; stub useSocket so the test suite never opens a real connection
// (the emit path is also gated behind TARGET_VOTE_HANDLER_LIVE=false and
// unreachable from a static render anyway).
vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
}))

const team = (
  name: string,
  overrides: Partial<FlowerTeamView> = {},
): FlowerTeamView => ({
  name,
  effects: [],
  previousAttackerTeamId: null,
  ...overrides,
})

const activeSelection = (): TargetVoteSelection => ({
  offerId: "offer-1",
  optionId: "acid_rain",
  selectedAtServerMs: Date.now() + 10_000, // future anchor -> fresh 5s window
})

// TargetTeamChips is the portal-free presentational half of TargetTeamVote
// (see the component's docstring): Radix's Portal only materialises its
// children once mounted via useLayoutEffect, which never fires during
// renderToStaticMarkup, so content living inside RadixAlertDialog.Portal is
// structurally unreachable from a static-markup test. Exercising Chips
// directly is how the actual vote markup gets real (non-attrappen) coverage.
const noop = () => {}
const renderChips = (
  candidates: FlowerTeamView[],
  overrides: Partial<Parameters<typeof TargetTeamChips>[0]> = {},
) =>
  renderToStaticMarkup(
    <TargetTeamChips
      candidates={candidates}
      selectedTeam={null}
      statusMessage=""
      cooldownSec={5}
      totalSec={5}
      isTeamShielded={() => false}
      isTeamAntiRepeat={() => false}
      isTeamDisabled={() => false}
      onSelect={noop}
      onSubmit={noop}
      {...overrides}
    />,
  )

describe("filterVoteCandidates (WP-FLB-17 wire filtering)", () => {
  it("excludes the voter's own team from the candidate list (hard literal)", () => {
    const teams = [team("red"), team("blue"), team("green"), team("yellow")]

    const result = filterVoteCandidates(teams, "blue")

    expect(result.map((t) => t.name)).toEqual(["red", "green", "yellow"])
  })

  it("never returns the own team even if it appears multiple times", () => {
    const teams = [team("red"), team("blue"), team("red")]

    const result = filterVoteCandidates(teams, "red")

    expect(result.map((t) => t.name)).toEqual(["blue"])
  })
})

describe("TargetTeamChips (Player Client, WP-FLB-17)", () => {
  it("renders chips only for the pre-filtered candidate teams (own team excluded upstream)", () => {
    const candidates = filterVoteCandidates(
      [team("red"), team("blue"), team("green"), team("yellow")],
      "blue",
    )
    const html = renderChips(candidates)

    expect(html).toContain('data-testid="target-team-red"')
    expect(html).toContain('data-testid="target-team-green"')
    expect(html).toContain('data-testid="target-team-yellow"')
    expect(html).not.toContain('data-testid="target-team-blue"')
    expect(html.match(/role="radio"/g)?.length).toBe(3)
  })

  it("marks a shielded team visibly but keeps it selectable (not disabled)", () => {
    const candidates = [team("red"), team("green")]
    const html = renderChips(candidates, {
      isTeamShielded: (t) => t.name === "green",
      isTeamDisabled: () => false,
    })

    expect(html).toContain('data-testid="target-team-green-shield"')
    expect(html).not.toContain('data-testid="target-team-red-shield"')

    // The className legitimately contains the Tailwind variant prefix
    // "disabled:cursor-not-allowed" even when NOT disabled — assert on the
    // real HTML attribute (`disabled=""`), not the bare substring.
    const greenTag = /<button[^>]*data-testid="target-team-green"[^>]*>/.exec(html)?.[0]
    expect(greenTag).toBeDefined()
    expect(greenTag).not.toContain('disabled=""')
  })

  it("disables the anti-repeat team and shows its reason text", () => {
    const candidates = [team("red"), team("green")]
    const html = renderChips(candidates, {
      isTeamAntiRepeat: (t) => t.name === "green",
      isTeamDisabled: (t) => t.name === "green",
    })

    const greenTag = /<button[^>]*data-testid="target-team-green"[^>]*>/.exec(html)?.[0]
    expect(greenTag).toContain('disabled=""')
    expect(html).toContain('data-testid="target-team-green-reason"')

    const redTag = /<button[^>]*data-testid="target-team-red"[^>]*>/.exec(html)?.[0]
    expect(redTag).not.toContain('disabled=""')
    expect(html).not.toContain('data-testid="target-team-red-reason"')
  })

  it("locks every chip once voting is closed (submitted or expired)", () => {
    const candidates = [team("red"), team("green"), team("yellow")]
    const html = renderChips(candidates, { isTeamDisabled: () => true })

    const tags = html.match(/<button[^>]*data-testid="target-team-[^"]+"[^>]*>/g)
    expect(tags?.length).toBe(3)
    for (const tag of tags ?? []) {
      expect(tag).toContain("disabled")
    }
  })

  it("exposes the required aria attributes", () => {
    const html = renderChips([team("red"), team("green")])

    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("aria-checked")
  })
})

describe("TargetTeamVote (Player Client, WP-FLB-17) — mode/selection gating", () => {
  it("renders nothing outside FlowerBattle mode, even with an active acid_rain selection", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="classic"
        selection={activeSelection()}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing when there is no active selection", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="flowerBattle"
        selection={null}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing when the selected power-up isn't acid_rain", () => {
    const html = renderToStaticMarkup(
      <TargetTeamVote
        mode="flowerBattle"
        selection={{ ...activeSelection(), optionId: "fertilizer" }}
        teams={[team("red"), team("blue")]}
        ownTeamName="blue"
      />,
    )

    expect(html).toBe("")
  })
})
