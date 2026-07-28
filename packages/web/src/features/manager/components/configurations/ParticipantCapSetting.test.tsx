import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ParticipantCapSetting } from "./ParticipantCapSetting"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

describe("ParticipantCapSetting Component (Issue #477 / SDD #477)", () => {
  it("renders setting title, subtitle, and input element", () => {
    const html = renderToStaticMarkup(
      <ParticipantCapSetting value={100} onChange={vi.fn()} />
    )

    expect(html).toContain("Teilnehmer-Limit")
    expect(html).toContain("Maximale Anzahl gleichzeitiger Spieler in der Session")
    expect(html).toContain('data-testid="participant-cap-input"')
    expect(html).toContain('value="100"')
  })

  it("renders preset pill buttons for common caps including unlimited", () => {
    const html = renderToStaticMarkup(
      <ParticipantCapSetting value={null} onChange={vi.fn()} />
    )

    expect(html).toContain('data-testid="cap-preset-25"')
    expect(html).toContain('data-testid="cap-preset-50"')
    expect(html).toContain('data-testid="cap-preset-100"')
    expect(html).toContain('data-testid="cap-preset-unlimited"')
  })

  it("highlights active preset pill matching selected value", () => {
    const html = renderToStaticMarkup(
      <ParticipantCapSetting value={50} onChange={vi.fn()} />
    )

    expect(html).toContain("bg-[var(--color-primary)] text-white") // token-ok: white-on-primary, AA per design.md §8·B D6
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <ParticipantCapSetting value={null} onChange={vi.fn()} testIdPrefix="config-" />
    )

    expect(html).toContain('data-testid="config-participant-cap-setting"')
    expect(html).toContain('data-testid="config-participant-cap-input"')
  })

  it("disables input and preset buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <ParticipantCapSetting value={null} onChange={vi.fn()} disabled={true} />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("exports ParticipantCapSetting function component", () => {
    expect(typeof ParticipantCapSetting).toBe("function")
  })
})
