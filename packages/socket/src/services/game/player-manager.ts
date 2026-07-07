import { createHash, randomBytes } from "node:crypto"
import { EVENTS } from "@razzoozle/common/constants"
import type { Player } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { usernameValidator } from "@razzoozle/common/validators/auth"
import { getGameConfig } from "@razzoozle/socket/services/config"
import { ScoreboardThrottle } from "@razzoozle/socket/services/game/scoreboard-throttle"

// Hard cap on concurrent players per game (DoS / resource guard).
const MAX_PLAYERS_PER_GAME = 200

// Lobby-burst throttle for the UPDATE_LEADERBOARD broadcast in
// broadcastPlayerUpdate(). setAvatar/selectTeam can fire rapidly (many players
// picking avatars/teams within the same few seconds), and every call
// re-serializes the ENTIRE roster (up to MAX_PLAYERS_PER_GAME players, each
// carrying up to a 64KB avatar data URL) to the whole room. Leading+trailing
// coalescing keeps the first update instant while collapsing a burst into one
// trailing emit with the latest roster, instead of one full-roster emit per tap.
const LEADERBOARD_BROADCAST_THROTTLE_MS = 150

// I2 — Privacy-first identifier salt for pseudonymous assignment tracking.
// Per-server salt via environment variable; constant fallback for dev/test.
// ponytail: server ops can rotate salt via RAZZOOZLE_IDENTIFIER_SALT env var.
const IDENTIFIER_SALT =
  process.env.RAZZOOZLE_IDENTIFIER_SALT ?? "razzoozle-default-salt"

export class PlayerManager {
  private readonly io: Server
  private readonly gameId: string
  private readonly getManagerId: () => string
  // Predicate: is the owning game already over? A finished game keeps its
  // roster (for the FINISHED standings), so findByClientId still matches a
  // returning/refreshing player — without this guard the join below would
  // mis-report that genuine "the game is over" case as playerAlreadyConnected.
  // Defaults to "never ended" so the unit harness (which omits it) and any
  // lobby-only game behave exactly as before.
  private readonly isGameEnded: () => boolean
  private readonly getJoinLocked: () => boolean
  private players: Player[] = []
  // P2b — Server-side player tokens: clientId → token. Tokens are minted on
  // join and used to verify reconnects. NEVER serialized on Player (anti-spoof).
  private readonly playerTokens = new Map<string, string>()
  // I2 — Read ONCE at construction (like lowLatency/teamMode on Game), instead
  // of a blocking sync fs read+parse+zod-validate on every join. getGameConfig()
  // was previously called per join() call, so a lobby filling up with players
  // meant one disk read per player. Crash-guarded: a config read error falls
  // back to false (guest mode), matching the try/catch this replaces.
  private readonly requireIdentifier: boolean
  // See LEADERBOARD_BROADCAST_THROTTLE_MS above.
  private readonly leaderboardThrottle: ScoreboardThrottle<
    Array<Omit<Player, "identifierHash">>
  >

  constructor(
    io: Server,
    gameId: string,
    getManagerId: () => string,
    isGameEnded: () => boolean = () => false,
    getJoinLocked: () => boolean = () => false,
  ) {
    this.io = io
    this.gameId = gameId
    this.getManagerId = getManagerId
    this.isGameEnded = isGameEnded
    this.getJoinLocked = getJoinLocked
    this.requireIdentifier = (() => {
      try {
        return getGameConfig().requireIdentifier ?? false
      } catch {
        return false
      }
    })()
    this.leaderboardThrottle = new ScoreboardThrottle(
      LEADERBOARD_BROADCAST_THROTTLE_MS,
      (leaderboard) => {
        this.io
          .to(this.gameId)
          .emit(EVENTS.PLAYER.UPDATE_LEADERBOARD, { leaderboard })
      },
    )
  }

  // I2 — Compute salted SHA-256 hash of pseudonymous identifier (lowercase + trimmed).
  // Deterministic: same identifier+salt → same hash always.
  // Salted: prevents rainbow table attacks (per-server unique salt).
  // Lowercased: case-insensitive matching ('Alice' and 'alice' hash identically).
  // NEVER logs the raw identifier (PII protection).
  private computeIdentifierHash(identifier: string): string {
    return createHash("sha256")
      .update(`${IDENTIFIER_SALT}:${identifier.trim().toLowerCase()}`)
      .digest("hex")
  }

  // I2 — Strip identifierHash before broadcast (privacy: back-end assignment
  // tracking only, never visible in live game UI or to manager/players).
  private stripIdentifierHash(
    player: Player,
  ): Omit<Player, "identifierHash"> {
    const { identifierHash: _, ...safe } = player
    return safe
  }

  join(socket: Socket, username: string, avatar?: string, identifier?: string): void {
    const clientId = socket.handshake.auth.clientId as string

    // Disentangle "the game has ended" from "you are a duplicate active
    // connection". Both states can have a roster entry for this clientId, so the
    // ended check MUST come first — otherwise a player landing on a finished game
    // is wrongly told playerAlreadyConnected instead of gameEnded. (A genuinely
    // missing game never reaches here: withGame emits game.notFound upstream.)
    if (this.isGameEnded()) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.gameEnded")

      return
    }

    // Check if lobby is locked for NEW players (existing players/reconnects unaffected)
    const existing = this.findByClientId(clientId)
    if (this.getJoinLocked() && !existing) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.locked")

      return
    }
    if (existing) {
      socket.emit(
        EVENTS.GAME.ERROR_MESSAGE,
        "errors:game.playerAlreadyConnected",
      )

      return
    }

    const result = usernameValidator.safeParse(username)

    if (result.error) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return
    }

    if (this.players.length >= MAX_PLAYERS_PER_GAME) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.gameFull")

      return
    }

    socket.join(this.gameId)

    const player: Player = {
      id: socket.id,
      clientId,
      connected: true,
      username,
      points: 0,
      streak: 0,
      ...(avatar ? { avatar } : {}),
    }

    // I2 — Compute and set identifierHash if the game requires identification
    // AND the client supplied a non-empty identifier. Opt-in, guest-default.
    // Uses the read-once this.requireIdentifier snapshot (see constructor) —
    // no per-join config read.
    if (this.requireIdentifier && identifier?.trim()) {
      player.identifierHash = this.computeIdentifierHash(identifier)
    }

    this.players.push(player)

    // P2b — Mint server-side player token for this clientId. CSPRNG 32-byte
    // base64url token, stored in side-table (never on wire Player).
    const token = randomBytes(32).toString("base64url")
    this.playerTokens.set(clientId, token)

    // I2: Strip identifierHash before broadcast (never visible to manager/players).
    this.io
      .to(this.getManagerId())
      .emit(EVENTS.MANAGER.NEW_PLAYER, this.stripIdentifierHash(player))
    this.io.to(this.gameId).emit(EVENTS.GAME.TOTAL_PLAYERS, this.players.length)
    // P2b — Emit SUCCESS_JOIN with gameId and playerToken payload.
    socket.emit(EVENTS.GAME.SUCCESS_JOIN, { gameId: this.gameId, playerToken: token })
  }

  // Insert a pre-built sim-mode bot directly (bypasses the socket-dependent
  // join()): a bot has no real socket / clientId-collision check and no username
  // validation (its name is server-generated + deduped by the BotManager). We
  // emit MANAGER.NEW_PLAYER so the bot surfaces in the host roster, but DO NOT
  // broadcast the count here — Game.addBots calls broadcastCount() once after
  // the whole batch so N bots don't trigger N count emits.
  addBot(player: Player): void {
    this.players.push(player)
    // I2: Strip identifierHash before broadcast (bots never have identifiers anyway).
    this.io
      .to(this.getManagerId())
      .emit(EVENTS.MANAGER.NEW_PLAYER, this.stripIdentifierHash(player))
  }

  kick(socket: Socket, playerId: string): boolean {
    if (this.getManagerId() !== socket.id) {
      return false
    }

    const player = this.findById(playerId)

    if (!player) {
      return false
    }

    this.players = this.players.filter((p) => p.id !== playerId)
    // P2b — Delete player token on removal.
    this.playerTokens.delete(player.clientId)

    this.io.in(playerId).socketsLeave(this.gameId)
    this.io.to(player.id).emit(EVENTS.GAME.RESET, "errors:game.kickedByManager")
    this.io
      .to(this.getManagerId())
      .emit(EVENTS.MANAGER.PLAYER_KICKED, player.id)
    this.io.to(this.gameId).emit(EVENTS.GAME.TOTAL_PLAYERS, this.players.length)

    return true
  }

  remove(socketId: string): Player | undefined {
    const player = this.findById(socketId)

    if (!player) {
      return undefined
    }

    this.players = this.players.filter((p) => p.id !== socketId)
    // P2b — Delete player token on removal.
    this.playerTokens.delete(player.clientId)

    return player
  }

  setDisconnected(socketId: string): void {
    const player = this.findById(socketId)

    if (player) {
      player.connected = false
    }
  }

  updateSocketId(oldId: string, newId: string): void {
    const player = this.findById(oldId)

    if (player) {
      player.id = newId
    }
  }

  setAvatar(clientId: string, avatar: string): Player | undefined {
    const player = this.findByClientId(clientId)

    if (!player) {
      return undefined
    }

    player.avatar = avatar

    return player
  }

  broadcastPlayerUpdate(player: Player): void {
    // I2: Strip identifierHash before broadcast (never visible to manager/players).
    const safe = this.stripIdentifierHash(player)
    this.io.to(this.getManagerId()).emit(EVENTS.MANAGER.NEW_PLAYER, safe)
    // The full-roster UPDATE_LEADERBOARD broadcast is throttled (see
    // LEADERBOARD_BROADCAST_THROTTLE_MS) — the single-player NEW_PLAYER emit
    // above is small and stays immediate.
    const safeLeaderboard = this.players.map((p) => this.stripIdentifierHash(p))
    this.leaderboardThrottle.push(safeLeaderboard)
  }

  replace(players: Player[]): void {
    this.players = players
  }

  findById(socketId: string): Player | undefined {
    return this.players.find((p) => p.id === socketId)
  }

  findByClientId(clientId: string): Player | undefined {
    return this.players.find((p) => p.clientId === clientId)
  }

  getAll(): Player[] {
    return this.players
  }

  count(): number {
    return this.players.length
  }

  broadcastCount(): void {
    this.io.to(this.gameId).emit(EVENTS.GAME.TOTAL_PLAYERS, this.players.length)
  }

  // P2b — Retrieve player token for a clientId (for reconnect verification).
  // Returns undefined if no token was minted (legacy fallback allowed).
  getToken(clientId: string): string | undefined {
    return this.playerTokens.get(clientId)
  }

  // ── Crash-recovery snapshot ──────────────────────────────────────────────
  // Serialize only the STABLE, durable fields. The volatile socket id and the
  // live `connected` flag are intentionally dropped — on restore they are
  // reconstructed as id:"" / connected:false until a real socket re-binds via
  // the existing clientId-based reconnect flow. Pure read; no behaviour change.
  // I2: Intentionally omit identifierHash from snapshots (back-end tracking only,
  // never persisted; reconstructed on re-join if requireIdentifier is still true).
  // P2b: Tokens are NOT persisted to snapshots (server-side volatile, minted fresh
  // on each join).
  toSnapshot(): Array<{
    clientId: string
    username: string
    points: number
    streak: number
    avatar?: string
    teamId?: string
  }> {
    // Filter sim-mode bots: they are a transient test aid and must NEVER persist
    // to a crash-recovery snapshot (a restore must not resurrect bot ghosts).
    return this.players
      .filter((p) => !p.isBot)
      .map((p) => ({
        clientId: p.clientId,
        username: p.username,
        points: p.points,
        streak: p.streak,
        ...(p.avatar ? { avatar: p.avatar } : {}),
        // Persist team membership so a restored game keeps team standings intact.
        ...(p.teamId ? { teamId: p.teamId } : {}),
      }))
  }

  // Rebuild the player list from a snapshot as DETACHED records (no live
  // socket): id:"" and connected:false. The existing reconnect flow swaps in a
  // real socket id + flips connected:true when each browser reconnects.
  // P2b: Tokens are NOT restored (will be minted fresh on next join).
  restore(
    players: Array<{
      clientId: string
      username: string
      points: number
      streak: number
      avatar?: string
      teamId?: string
    }>,
  ): void {
    this.players = players.map((p) => ({
      id: "",
      clientId: p.clientId,
      connected: false,
      username: p.username,
      points: p.points,
      streak: p.streak,
      ...(p.avatar ? { avatar: p.avatar } : {}),
      ...(p.teamId ? { teamId: p.teamId } : {}),
    }))
  }
}
