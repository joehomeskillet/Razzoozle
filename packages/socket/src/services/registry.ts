import { DISPLAY_PAIRING_TTL_MINUTES } from "@razzia/common/constants"
// `import type` (not a runtime import): registry only uses Game as a type. A
// runtime import here creates a registry<->game import cycle, and esbuild's
// init order then leaves `Registry` undefined when game/index.ts calls
// Registry.getInstance() at module load — a startup crash that surfaces (when
// minified) as a misleading zod "cyclical schemas" error. Type-only breaks it.
import type Game from "@razzia/socket/services/game"
import dayjs from "dayjs"

interface EmptyGame {
  since: number
  game: Game
}

// A satellite display ("Raspberry Pi" kiosk) that has announced a pairing code
// but has not yet been paired to a game by a manager.
export interface DisplayPairing {
  socketId: string
  createdAt: number
}

class Registry {
  private static instance: Registry | null = null
  private games: Game[] = []
  private emptyGames: EmptyGame[] = []
  private pairings = new Map<string, DisplayPairing>()
  private cleanupInterval: ReturnType<typeof setTimeout> | null = null
  private readonly EMPTY_GAME_TIMEOUT_MINUTES = 5
  private readonly PAIRING_TIMEOUT_MINUTES = DISPLAY_PAIRING_TTL_MINUTES
  private readonly CLEANUP_INTERVAL_MS = 60_000

  private constructor() {
    this.startCleanupTask()
  }

  static getInstance(): Registry {
    Registry.instance ??= new Registry()

    return Registry.instance
  }

  addGame(game: Game): void {
    this.games.push(game)
    console.log(`Game ${game.gameId} added. Total games: ${this.games.length}`)
  }

  getGameById(gameId: string): Game | undefined {
    return this.games.find((g) => g.gameId === gameId)
  }

  getGameByInviteCode(inviteCode: string): Game | undefined {
    return this.games.find((g) => g.inviteCode === inviteCode)
  }

  getPlayerGame(gameId: string, clientId: string): Game | undefined {
    return this.games.find(
      (g) =>
        g.gameId === gameId && g.players.some((p) => p.clientId === clientId),
    )
  }

  getManagerGame(gameId: string, clientId: string): Game | undefined {
    return this.games.find(
      (g) => g.gameId === gameId && g.manager.clientId === clientId,
    )
  }

  getGameByManagerSocketId(socketId: string): Game | undefined {
    return this.games.find((g) => g.manager.id === socketId)
  }

  getGameByPlayerSocketId(socketId: string): Game | undefined {
    return this.games.find((g) => g.players.some((p) => p.id === socketId))
  }

  markGameAsEmpty(game: Game): void {
    const alreadyEmpty = this.emptyGames.find(
      (g) => g.game.gameId === game.gameId,
    )

    if (!alreadyEmpty) {
      this.emptyGames.push({
        since: dayjs().unix(),
        game,
      })
      console.log(
        `Game ${game.gameId} marked as empty. Total empty games: ${this.emptyGames.length}`,
      )
    }
  }

  reactivateGame(gameId: string): void {
    const initialLength = this.emptyGames.length
    this.emptyGames = this.emptyGames.filter((g) => g.game.gameId !== gameId)

    if (this.emptyGames.length < initialLength) {
      console.log(
        `Game ${gameId} reactivated. Remaining empty games: ${this.emptyGames.length}`,
      )
    }
  }

  removeGame(gameId: string): boolean {
    const initialLength = this.games.length
    const target = this.games.find((g) => g.gameId === gameId)
    this.games = this.games.filter((g) => g.gameId !== gameId)
    this.emptyGames = this.emptyGames.filter((g) => g.game.gameId !== gameId)

    const removed = this.games.length < initialLength

    if (removed) {
      // Free any low-latency metrics buffers/timers for this game so the
      // per-room metrics map can't accumulate keys over a long-lived server.
      // No-op in normal mode (nothing was ever recorded).
      target?.disposeMetrics()
      console.log(`Game ${gameId} removed. Total games: ${this.games.length}`)
    }

    return removed
  }

  getAllGames(): Game[] {
    return [...this.games]
  }

  getGameCount(): number {
    return this.games.length
  }

  getEmptyGameCount(): number {
    return this.emptyGames.length
  }

  // ── Display pairing (satellite kiosk) ────────────────────────────────────

  registerPairing(code: string, socketId: string): void {
    this.pairings.set(code, { socketId, createdAt: dayjs().unix() })
    console.log(
      `Display pairing code registered. Total pending: ${this.pairings.size}`,
    )
  }

  getPairing(code: string): DisplayPairing | undefined {
    return this.pairings.get(code)
  }

  // A pairing is valid only while it exists AND is within the TTL window.
  isPairingValid(code: string): boolean {
    const pairing = this.pairings.get(code)

    if (!pairing) {
      return false
    }

    return (
      dayjs().diff(dayjs.unix(pairing.createdAt), "minute") <
      this.PAIRING_TIMEOUT_MINUTES
    )
  }

  removePairing(code: string): boolean {
    return this.pairings.delete(code)
  }

  getPairingCount(): number {
    return this.pairings.size
  }

  private cleanupPairings(): void {
    const now = dayjs()
    let removed = 0

    for (const [code, pairing] of this.pairings) {
      if (
        now.diff(dayjs.unix(pairing.createdAt), "minute") >=
        this.PAIRING_TIMEOUT_MINUTES
      ) {
        this.pairings.delete(code)
        removed += 1
      }
    }

    if (removed > 0) {
      console.log(
        `Removed ${removed} stale display pairing(s). Remaining: ${this.pairings.size}`,
      )
    }
  }

  private cleanupEmptyGames(): void {
    const now = dayjs()
    const stillEmpty = this.emptyGames.filter(
      (g) =>
        now.diff(dayjs.unix(g.since), "minute") <
        this.EMPTY_GAME_TIMEOUT_MINUTES,
    )

    if (stillEmpty.length === this.emptyGames.length) {
      return
    }

    const removed = this.emptyGames.filter((g) => !stillEmpty.includes(g))
    const removedGameIds = removed.map((r) => r.game.gameId)

    // Free LL metrics buffers/timers for each timed-out game (no-op in normal
    // mode) so the per-room metrics map doesn't leak across cleanups.
    removed.forEach((r) => r.game.disposeMetrics())

    this.games = this.games.filter((g) => !removedGameIds.includes(g.gameId))
    this.emptyGames = stillEmpty

    console.log(
      `Removed ${removed.length} empty game(s). Remaining games: ${this.games.length}`,
    )
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupEmptyGames()
      this.cleanupPairings()
    }, this.CLEANUP_INTERVAL_MS)

    console.log("Game cleanup task started")
  }

  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      console.log("Game cleanup task stopped")
    }
  }

  cleanup(): void {
    this.stopCleanupTask()
    this.games = []
    this.emptyGames = []
    this.pairings.clear()
    console.log("Registry cleaned up")
  }
}

export default Registry
