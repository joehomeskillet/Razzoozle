import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ManagerActionFooter,
  type ManagerTeamStatus,
} from "../ManagerActionFooter"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

const renderFooter = (
  props: React.ComponentProps<typeof ManagerActionFooter> = {},
) => renderToStaticMarkup(<ManagerActionFooter {...props} />)

describe("ManagerActionFooter (Console)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rendert Auto-Modus, Live-Aktionen und beide Timer-Schritte", () => {
    const markup = renderFooter()

    expect(markup.match(/<button/g)).toHaveLength(5)
    expect(markup).toContain('aria-label="Auto-Modus: aus"')
    expect(markup).toContain('aria-label="Frage überspringen"')
    expect(markup).toContain('aria-label="Auflösen"')
    expect(markup).toContain('aria-label="10 Sekunden wegnehmen"')
    expect(markup).toContain('aria-label="10 Sekunden dazugeben"')
  })

  it("trägt aria-pressed, Fokus-Ring und reduzierte Bewegung", () => {
    const markup = renderFooter({ autoMode: true })

    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain("focus-visible:outline-2")
    expect(markup).toContain("focus-visible:outline-offset-2")
    expect(markup).toContain("motion-reduce:transition-none")
    expect(markup).toContain("transition-transform")
    expect(markup).not.toContain("animate-")
  })

  it("zeigt Team-Status-Indikatoren mit zugänglichen Beschriftungen", () => {
    const teams: readonly ManagerTeamStatus[] = [
      { id: "red", label: "Rot", status: "online" },
      {
        id: "blue",
        label: "Blau",
        status: "offline",
        detail: "Nicht verbunden",
      },
    ]

    const markup = renderFooter({ teams })

    expect(markup).toContain('aria-label="Teamstatus"')
    expect(markup).toContain("Rot")
    expect(markup).toContain("Online")
    expect(markup).toContain("Blau")
    expect(markup).toContain("Nicht verbunden")
    expect(markup).toContain("bg-status-online-text")
    expect(markup).toContain("bg-status-offline-text")
  })
})
