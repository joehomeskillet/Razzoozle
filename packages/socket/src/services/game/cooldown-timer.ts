import { EVENTS } from "@razzoozle/common/constants"
import type { Server } from "@razzoozle/common/types/game/socket"

export class CooldownTimer {
  private readonly io: Server
  private readonly gameId: string
  private active = false
  // Remaining seconds for the in-flight countdown, hoisted out of start()'s
  // closure so a host live-control (adjust) can shift it mid-tick. -1 when no
  // countdown is running.
  private count = -1
  // The live interval handle, kept so adjust() can detect (and not act on) a
  // stopped timer. null when no countdown is running.
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(io: Server, gameId: string) {
    this.io = io
    this.gameId = gameId
  }

  start(seconds: number): Promise<void> {
    if (this.active) {
      return Promise.resolve()
    }

    this.active = true
    this.count = seconds - 1

    return new Promise<void>((resolve) => {
      this.interval = setInterval(() => {
        if (!this.active || this.count <= 0) {
          this.active = false
          if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
          }
          this.count = -1
          resolve()

          return
        }

        this.io.to(this.gameId).emit(EVENTS.GAME.COOLDOWN, this.count)
        this.count -= 1
      }, 1000)
    })
  }

  // Host live-control: shift the running countdown by deltaSeconds (positive =
  // extend, negative = shorten). No-op when no countdown is active. Pushes the
  // new remaining value to the room immediately so clients re-sync their bar
  // without waiting for the next 1s tick. The result is floored at 0 (a shorten
  // past zero ends the question on the next tick, same as a natural elapse).
  // Returns the new remaining seconds (0 when inactive) so the caller can notify.
  adjust(deltaSeconds: number): number {
    if (!this.active) {
      return 0
    }

    this.count = Math.max(0, this.count + deltaSeconds)
    this.io.to(this.gameId).emit(EVENTS.GAME.COOLDOWN, this.count)

    return this.count
  }

  // Whether a countdown is currently running. Lets the round manager decide if a
  // live-control (skip / adjust / reveal) has an in-flight question to act on.
  isActive(): boolean {
    return this.active
  }

  abort() {
    this.active = false
  }
}
