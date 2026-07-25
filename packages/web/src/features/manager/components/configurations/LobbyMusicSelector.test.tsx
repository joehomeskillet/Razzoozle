import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LobbyMusicSelector } from "./LobbyMusicSelector"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; title?: string }) => {
      let str = options?.defaultValue ?? key
      if (options?.title) str = str.replace("{{title}}", options.title)
      return str
    },
  }),
}))

describe("LobbyMusicSelector Component (Issue #475 / SDD #475)", () => {
  it("renders music title and default preset options", () => {
    const html = renderToStaticMarkup(
      <LobbyMusicSelector selectedPresetId="funk" onChange={vi.fn()} />
    )

    expect(html).toContain("Lobby-Musik auswählen")
    expect(html).toContain("Funky Lobby")
    expect(html).toContain("Retro Disco")
    expect(html).toContain("Neon Nights")
  })

  it("marks selected preset with aria-selected true", () => {
    const html = renderToStaticMarkup(
      <LobbyMusicSelector selectedPresetId="disco" onChange={vi.fn()} />
    )

    expect(html).toContain('data-testid="music-preset-disco"')
    expect(html).toContain('aria-selected="true"')
  })

  it("renders preview play buttons for each preset", () => {
    const html = renderToStaticMarkup(
      <LobbyMusicSelector selectedPresetId="funk" onChange={vi.fn()} />
    )

    expect(html).toContain('data-testid="music-preview-funk"')
    expect(html).toContain('data-testid="music-preview-synthwave"')
  })

  it("supports testIdPrefix prop for custom isolation", () => {
    const html = renderToStaticMarkup(
      <LobbyMusicSelector selectedPresetId="funk" onChange={vi.fn()} testIdPrefix="config-" />
    )

    expect(html).toContain('data-testid="config-lobby-music-selector"')
    expect(html).toContain('data-testid="config-music-preset-funk"')
  })

  it("disables options and preview buttons when disabled prop is true", () => {
    const html = renderToStaticMarkup(
      <LobbyMusicSelector selectedPresetId="funk" onChange={vi.fn()} disabled={true} />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("cursor-not-allowed")
  })

  it("exports LobbyMusicSelector function component", () => {
    expect(typeof LobbyMusicSelector).toBe("function")
  })
})
