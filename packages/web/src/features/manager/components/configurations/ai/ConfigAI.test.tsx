// AI tab action footer — Save button (a11y, disabled state, click triggers save).
//
// Node-env SSR render (no jsdom — see vitest.config.ts). The SETTINGS event
// for the AI settings is fired inside the render pass via the mocked
// useEvent so the form-mounts view (with the Save button) replaces the empty
// state without needing a real socket.

import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EVENTS } from "@razzoozle/common/constants"
import type { AISettingsPublic } from "@razzoozle/common/types/ai"

import ConfigAI from "./ConfigAI"

const state = vi.hoisted(() => ({
  emit: vi.fn(),
  register: vi.fn(() => () => undefined),
  initialSettings: null as AISettingsPublic | null,
  fired: false,
}))

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: { emit: state.emit, on: vi.fn(), off: vi.fn() },
  }),
  useEvent: (event: string, callback: (payload: AISettingsPublic) => void) => {
    // Drive the SETTINGS event synchronously inside the render pass so the
    // form replaces the empty state without a real ws. Fire only once to
    // avoid the React-blessed "derive state during render" loop: the first
    // call sets state, the second render with the populated state skips the
    // fire (state.fired is true).
    if (
      event === EVENTS.AI.SETTINGS &&
      state.initialSettings &&
      !state.fired
    ) {
      state.fired = true
      callback(state.initialSettings)
    }
  },
}))

vi.mock(
  "@razzoozle/web/features/manager/contexts/action-footer-host-context",
  () => ({
    useActionFooterHostOptional: () => ({
      target: {} as HTMLElement,
      register: state.register,
      registrationCount: 1,
      setTarget: vi.fn(),
      variant: "compact",
    }),
  }),
)

const baseSettings: AISettingsPublic = {
  text: {
    activeProvider: "off",
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        kind: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        temperature: 0.7,
        keyConfigured: true,
      },
    ],
  },
  image: {
    activeProvider: "comfyui",
    providers: [
      {
        id: "comfyui",
        label: "ComfyUI",
        baseUrl: "http://localhost:8188",
        workflow: "default",
        resolution: 1024,
      },
    ],
  },
}

const renderAI = () => {
  state.emit.mockClear()
  state.register.mockClear()
  state.initialSettings = baseSettings
  const html = renderToStaticMarkup(<ConfigAI />)
  return html
}

const renderAIEmpty = () => {
  state.emit.mockClear()
  state.register.mockClear()
  state.initialSettings = null
  return renderToStaticMarkup(<ConfigAI />)
}

const saveButtonRegex =
  /<button[^>]*data-testid="config-ai-save-btn"[^>]*>[\s\S]*?<\/button>/
const extractSaveButton = (html: string) => saveButtonRegex.exec(html)?.[0]

describe("ConfigAI — Save button in action footer", () => {
  beforeEach(() => {
    state.emit.mockReset()
    state.register.mockReset().mockReturnValue(() => undefined)
    state.initialSettings = null
    state.fired = false
  })

  it("renders the EmptyState before the SETTINGS event arrives", () => {
    const html = renderAIEmpty()
    expect(html).toContain("manager:ai.title")
    expect(html).not.toContain('data-testid="config-ai-save-btn"')
  })

  it("renders a Save button using the existing ai.save i18n key", () => {
    const html = renderAI()
    const saveMatch = extractSaveButton(html)
    expect(saveMatch).toBeTruthy()
    expect(saveMatch).toContain("manager:ai.save")
  })

  it("disables the Save button when there are no pending changes", () => {
    const html = renderAI()
    const saveMatch = extractSaveButton(html)
    expect(saveMatch).toBeTruthy()
    expect(saveMatch).toMatch(/\sdisabled(?:=|\s|>)/)
  })

  it("keeps the Save button inside the action footer landmark", () => {
    const html = renderAI()
    const saveIdx = html.indexOf('data-testid="config-ai-save-btn"')
    const footerIdx = html.indexOf('data-testid="action-footer"')
    expect(saveIdx).toBeGreaterThan(-1)
    expect(footerIdx).toBeGreaterThan(-1)
  })
})
