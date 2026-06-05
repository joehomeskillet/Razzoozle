import { DISPLAY_PAIRING_TTL_MINUTES } from "@razzia/common/constants"
// `import type` (not a runtime import): registry only uses Game as a type. A
// runtime import here creates a registry<->game import cycle, and esbuild's
// init order then leaves `Registry` undefined when game/index.ts calls
// Registry.getInstance() at module load — a startup crash that surfaces (when
// minified) as a misleading zod "cyclical schemas" error. Type-only breaks it.
import type Game from "@razzia/socket/services/game"
import type { Server } from "@razzia/common/types/game/socket"
import dayjs from "dayjs"
import fs from "fs"
import { resolve } from "path"

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
  // Periodic crash-recovery snapshot task handle (null when not running). Set by
  // startSnapshotTask(), cleared in cleanup() so no timer leaks across restarts.
  private snapshotInterval: ReturnType<typeof setInterval> | null = null
  private readonly EMPTY_GAME_TIMEOUT_MINUTES = 5
  private readonly PAIRING_TIMEOUT_MINUTES = DISPLAY_PAIRING_TTL_MINUTES
  private readonly CLEANUP_INTERVAL_MS = 60_000
  private readonly SNAPSHOT_VERSION = 1

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

    // A game that stayed empty past the grace window is truly abandoned (the
    // manager never reconnected). Tell its still-connected players the manager
    // is gone (clean RESET) instead of orphaning them, then free LL metrics
    // buffers/timers (no-op in normal mode) so the per-room metrics map doesn't
    // leak across cleanups. The blip case is unaffected: a reconnect within the
    // window calls reactivateGame, so it never reaches this list.
    removed.forEach((r) => {
      r.game.notifyManagerGone()
      r.game.disposeMetrics()
    })

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

  // ── Crash-recovery snapshot persistence ──────────────────────────────────
  //
  // Persist STABLE in-flight game state to disk on an interval (and on graceful
  // shutdown) so a process crash / redeploy doesn't lose a running event. On the
  // next boot loadSnapshot() rebuilds games DETACHED; the existing clientId
  // reconnect flow re-binds each browser. EVERY path here is crash-guarded: a
  // save failure or a corrupt/missing file is a no-op that NEVER throws into the
  // game loop or the boot sequence.

  private static snapshotDir(): string {
    const base = process.env.CONFIG_PATH ?? "./config"

    return resolve(base, "state")
  }

  private static snapshotFile(): string {
    return resolve(Registry.snapshotDir(), "registry.json")
  }

  // Atomically write the current game state. Writes to a .tmp sibling then
  // fs.renameSync (atomic on the same filesystem) so a crash mid-write can never
  // leave a half-written, unparseable snapshot. Wrapped in try/catch: a save
  // failure logs and continues — it must NEVER throw into the periodic task or
  // a signal handler.
  saveSnapshot(): void {
    try {
      // Skip trivially-empty games (no players AND not yet started): there is
      // nothing worth restoring and it keeps the file small. Anything with
      // players or that has started is saved in full.
      const games = this.games
        .filter((g) => g.started || g.players.length > 0)
        .map((g) => g.toSnapshot())

      const payload = {
        version: this.SNAPSHOT_VERSION,
        savedAt: Date.now(),
        games,
      }

      const dir = Registry.snapshotDir()

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const file = Registry.snapshotFile()
      const tmp = `${file}.tmp`

      fs.writeFileSync(tmp, JSON.stringify(payload))
      fs.renameSync(tmp, file)
    } catch (error) {
      // Never propagate — a failed snapshot must not disrupt live gameplay.
      console.error("Failed to save registry snapshot:", error)
    }
  }

  // Read + restore games from disk on boot. Missing file => no-op. Corrupt /
  // wrong-version file => logged + ignored (returns without restoring). Game is
  // imported dynamically to avoid the registry<->game runtime import cycle (see
  // the file header note); the dynamic import resolves to the same bundled
  // module after init, so Game is defined by the time we call fromSnapshot.
  async loadSnapshot(io: Server): Promise<void> {
    try {
      const file = Registry.snapshotFile()

      if (!fs.existsSync(file)) {
        return
      }

      const raw = fs.readFileSync(file, "utf-8")
      const parsed: unknown = (() => {
        try {
          return JSON.parse(raw) as unknown
        } catch (error) {
          console.error("Corrupt registry snapshot, ignoring:", error)

          return undefined
        }
      })()

      // Corrupt JSON parsed to undefined above (already logged) — bail.
      if (parsed === undefined) {
        return
      }

      const snapshot = parsed as {
        version?: number
        games?: unknown[]
      } | null

      if (
        !snapshot ||
        snapshot.version !== this.SNAPSHOT_VERSION ||
        !Array.isArray(snapshot.games)
      ) {
        console.warn("Unrecognised registry snapshot shape, ignoring")

        return
      }

      // Dynamic import breaks the registry<->game import cycle (registry only
      // type-imports Game at the top). Resolves to the bundled module.
      const { default: Game } = await import("@razzia/socket/services/game")

      let restored = 0

      for (const g of snapshot.games) {
        try {
          const game = Game.fromSnapshot(
            io,
            g as Parameters<typeof Game.fromSnapshot>[1],
          )
          this.addGame(game)
          // Mark restored so it is cleaned up normally if NOBODY reconnects
          // within the existing EMPTY_GAME_TIMEOUT window.
          this.markGameAsEmpty(game)
          restored += 1
        } catch (error) {
          // One bad game must not abort restoring the rest.
          console.error("Failed to restore a game from snapshot:", error)
        }
      }

      console.log(`Restored ${restored} game(s) from snapshot`)
    } catch (error) {
      // Any unexpected failure is swallowed: boot must never crash on restore.
      console.error("Failed to load registry snapshot:", error)
    }
  }

  // Arm the periodic snapshot. Idempotent: a second call clears the old handle
  // first so we never leak an interval.
  startSnapshotTask(intervalMs = 5000): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
    }

    this.snapshotInterval = setInterval(() => {
      this.saveSnapshot()
    }, intervalMs)

    console.log("Snapshot task started")
  }

  stopSnapshotTask(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
      console.log("Snapshot task stopped")
    }
  }

  cleanup(): void {
    this.stopCleanupTask()
    this.stopSnapshotTask()
    this.games = []
    this.emptyGames = []
    this.pairings.clear()
    console.log("Registry cleaned up")
  }
}

export default Registry
