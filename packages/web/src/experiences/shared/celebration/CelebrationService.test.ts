import { beforeEach, describe, expect, it, vi } from "vitest"

import { CelebrationService } from "./CelebrationService"

const { createWorker, fire } = vi.hoisted(() => {
  const fire = vi.fn(() => Promise.resolve(null))
  return {
    createWorker: vi.fn(() => fire),
    fire,
  }
})

vi.mock("canvas-confetti", () => ({
  default: Object.assign(vi.fn(), { create: createWorker }),
}))

describe("CelebrationService", () => {
  beforeEach(() => {
    createWorker.mockClear()
    fire.mockClear()
  })

  it("dispatches a center salvo through the real confetti adapter", async () => {
    const service = new CelebrationService()

    await service.dispatch(
      {
        id: "center-salvo-1",
        kind: "center-salvo",
      },
      false,
    )

    expect(createWorker).toHaveBeenCalledOnce()
    expect(createWorker).toHaveBeenCalledWith(null, { useWorker: true })
    expect(fire).toHaveBeenCalledOnce()
    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        particleCount: 45,
        origin: { x: 0.5, y: 0.6 },
      }),
    )
  })

  it("drops a concurrent duplicate with the default revision", async () => {
    const service = new CelebrationService()
    const request = {
      id: "duplicate-1",
      kind: "center-salvo",
    }

    await Promise.all([
      service.dispatch(request, false),
      service.dispatch(request, false),
    ])

    expect(createWorker).toHaveBeenCalledOnce()
    expect(fire).toHaveBeenCalledOnce()
  })

  it("accepts only increasing revisions for an id", async () => {
    const service = new CelebrationService()
    const request = {
      id: "revision-1",
      kind: "center-salvo",
    }

    await service.dispatch({ ...request, revision: 2 }, false)
    await service.dispatch({ ...request, revision: 2 }, false)
    await service.dispatch({ ...request, revision: 1 }, false)
    await service.dispatch({ ...request, revision: 3 }, false)

    expect(createWorker).toHaveBeenCalledTimes(2)
    expect(fire).toHaveBeenCalledTimes(2)
  })
})
