import type { ExperienceTransition } from "@razzoozle/common/types/game/experience"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

interface TestStatus {
  name: string
  data: Record<string, unknown>
}

interface SessionState {
  status: TestStatus | null
  CurrentComponent: ComponentType<{ data: Record<string, unknown> }> | null
  experienceTransition: ExperienceTransition | null
}

const managerSession = vi.hoisted(() => {
  let current: SessionState = {
    status: null,
    CurrentComponent: null,
    experienceTransition: null,
  }

  return {
    read: () => current,
    replace: (next: SessionState) => {
      current = next
    },
  }
})

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (definition: object): object =>
      definition,
  useParams: () => ({ gameId: "satellite-game" }),
}))

vi.mock("@razzoozle/web/features/game/hooks/useManagerGameSession", () => ({
  useManagerGameSession: () => managerSession.read(),
}))

vi.mock("@razzoozle/web/features/game/components/GameWrapper", () => ({
  default: ({
    children,
    contentTransitionKey,
    statusName,
  }: {
    children: ReactNode
    contentTransitionKey?: string
    statusName?: string
  }) => (
    <main
      data-content-transition-key={contentTransitionKey ?? statusName ?? "none"}
    >
      {children}
    </main>
  ),
}))

vi.mock(
  "@razzoozle/web/features/game/components/display/ExperienceDisplay",
  () => ({
    ExperienceDisplay: ({ data }: { data: ExperienceTransition }) => (
      <div data-experience-mode={data.mode} />
    ),
  }),
)

vi.mock("@razzoozle/web/features/game/contexts/socket-context", () => ({
  socketClient: { emit: vi.fn() },
}))

import { SatelliteManagerPage } from "../$gameId"

const CurrentComponent = ({ data }: { data: Record<string, unknown> }) => (
  <div data-status-component={String(data.kind)} />
)

const renderPage = (
  statusName: "SHOW_QUESTION" | "SHOW_RESULT",
  experienceTransition: ExperienceTransition | null,
) => {
  managerSession.replace({
    status: { name: statusName, data: { kind: statusName } },
    CurrentComponent,
    experienceTransition,
  })

  return renderToStaticMarkup(<SatelliteManagerPage />)
}

const flowerCases: Array<{
  statusName: "SHOW_QUESTION" | "SHOW_RESULT"
  phase: string
}> = [
  { statusName: "SHOW_QUESTION", phase: "question" },
  { statusName: "SHOW_RESULT", phase: "results" },
]

const fallbackCases: Array<{
  statusName: "SHOW_QUESTION" | "SHOW_RESULT"
  experienceTransition: ExperienceTransition | null
}> = [
  {
    statusName: "SHOW_QUESTION",
    experienceTransition: { mode: "classic", phase: "question" },
  },
  { statusName: "SHOW_RESULT", experienceTransition: null },
]

describe("SatelliteManagerPage content transition key", () => {
  it.each(flowerCases)(
    "keeps Flower Battle mounted during $statusName",
    ({ statusName, phase }) => {
      const html = renderPage(statusName, {
        mode: "flowerBattle",
        phase,
      })

      expect(html).toContain('data-content-transition-key="flowerBattle"')
      expect(html).toContain('data-experience-mode="flowerBattle"')
    },
  )

  it.each(fallbackCases)(
    "retains status fallback for $statusName without a non-classic experience",
    ({ statusName, experienceTransition }) => {
      const html = renderPage(statusName, experienceTransition)

      expect(html).toContain(`data-content-transition-key="${statusName}"`)
    },
  )
})
