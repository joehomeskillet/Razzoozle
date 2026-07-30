import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { FlowerPowerupVote, FlowerPowerupVoteCards } from "../FlowerPowerupVote"
import { parsePowerupOptions, type PowerupOfferView } from "../flower-battle.types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

// The default socket-context value creates a real io() client on module
// import; stub useSocket so the test suite never opens a real connection
// (the emit path is also gated behind POWERUP_VOTE_HANDLER_LIVE=false and
// unreachable from a static render anyway).
vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
}))

const futureOffer = (offerType: string): PowerupOfferView => ({
  id: "offer-1",
  offerType,
  expiresAt: Date.now() + 10_000,
})

// FlowerPowerupVoteCards is the portal-free presentational half of
// FlowerPowerupVote (see the component's docstring): Radix's Portal only
// materialises its children once mounted via useLayoutEffect, which never
// fires during renderToStaticMarkup, so content living inside
// RadixAlertDialog.Portal is structurally unreachable from a static-markup
// test. Exercising Cards directly is how the actual vote markup gets real
// (non-attrappen) coverage.
const noop = () => {}
const renderCards = (
  options: ReturnType<typeof parsePowerupOptions>,
  overrides: Partial<Parameters<typeof FlowerPowerupVoteCards>[0]> = {},
) =>
  renderToStaticMarkup(
    <FlowerPowerupVoteCards
      options={options}
      selected={null}
      cardsDisabled={false}
      locked={false}
      statusMessage=""
      cooldownSec={10}
      totalSec={10}
      onSelect={noop}
      onSubmit={noop}
      {...overrides}
    />,
  )

describe("parsePowerupOptions (WP-FLB-16 wire parsing)", () => {
  it("parses exactly 3 options from a comma-joined offerType (hard literal)", () => {
    expect(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield")).toEqual([
      "fertilizer",
      "sunbeam",
      "umbrella_shield",
    ])
  })

  it("drops unknown/garbled ids and never returns more than 3", () => {
    expect(
      parsePowerupOptions("fertilizer, sunbeam ,bogus,umbrella_shield,acid_rain"),
    ).toEqual(["fertilizer", "sunbeam", "umbrella_shield"])
  })
})

describe("FlowerPowerupVoteCards (Player Client, WP-FLB-16)", () => {
  it("renders exactly 3 cards parsed from the comma-joined offerType wire field", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"))

    expect(html).toContain('data-testid="powerup-option-fertilizer"')
    expect(html).toContain('data-testid="powerup-option-sunbeam"')
    expect(html).toContain('data-testid="powerup-option-umbrella_shield"')
    expect(html).not.toContain('data-testid="powerup-option-acid_rain"')
    // Exactly 3 radio cards, never a 4th.
    expect(html.match(/role="radio"/g)?.length).toBe(3)
  })

  it("renders name and effect copy keys for all 4 possible power-up options", () => {
    const comboA = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"))
    const comboB = renderCards(parsePowerupOptions("sunbeam,umbrella_shield,acid_rain"))
    const combined = comboA + comboB

    for (const id of ["fertilizer", "sunbeam", "umbrella_shield", "acid_rain"]) {
      expect(combined).toContain(`flowerBattle.powerupVote.options.${id}.name`)
      expect(combined).toContain(`flowerBattle.powerupVote.options.${id}.effect`)
    }
  })

  it("renders locked/disabled cards once the offer has expired", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"), {
      cardsDisabled: true,
      locked: true,
      cooldownSec: 0,
    })

    // All 3 option cards (not the submit button) carry the native `disabled`
    // attribute on their own opening tag — no late tap possible.
    const cardTags = html.match(/<button[^>]*data-testid="powerup-option-[^"]+"[^>]*>/g)
    expect(cardTags?.length).toBe(3)
    for (const tag of cardTags ?? []) {
      expect(tag).toContain("disabled")
    }
  })

  it("marks the selected card via aria-checked and exposes the required aria attributes", () => {
    const html = renderCards(parsePowerupOptions("fertilizer,sunbeam,umbrella_shield"), {
      selected: "sunbeam",
    })

    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)?.length).toBe(3)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')

    const sunbeamCard = html.slice(html.indexOf('data-testid="powerup-option-sunbeam"') - 200)
    expect(sunbeamCard.slice(0, 260)).toContain('aria-checked="true"')
  })
})

describe("FlowerPowerupVote (Player Client, WP-FLB-16) — mode/offer gating", () => {
  it("renders nothing outside FlowerBattle mode, even with an active offer", () => {
    const html = renderToStaticMarkup(
      <FlowerPowerupVote
        mode="classic"
        offer={futureOffer("fertilizer,sunbeam,umbrella_shield")}
      />,
    )

    expect(html).toBe("")
  })

  it("renders nothing in FlowerBattle mode when there is no active offer", () => {
    const html = renderToStaticMarkup(<FlowerPowerupVote mode="flowerBattle" offer={null} />)

    expect(html).toBe("")
  })
})
