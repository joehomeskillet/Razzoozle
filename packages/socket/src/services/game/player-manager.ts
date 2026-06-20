import { createHash } from "node:crypto"
import { EVENTS } from "@razzoozle/common/constants"
import type { Player } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { usernameValidator } from "@razzoozle/common/validators/auth"
import { getGameConfig } from "@razzoozle/socket/services/config"

// Hard cap on concurrent players per game (DoS / resource guard).
const MAX_PLAYERS_PER_GAME = 200

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
    try {
      const config = getGameConfig()
      if (config.requireIdentifier && identifier?.trim()) {
        player.identifierHash = this.computeIdentifierHash(identifier)
      }
    } catch {
      // Config read error: fall back to guest mode (no identifier).
      // The game continues normally; identifierHash stays undefined.
    }

    this.players.push(player)
    // I2: Strip identifierHash before broadcast (never visible to manager/players).
    this.io
      .to(this.getManagerId())
      .emit(EVENTS.MANAGER.NEW_PLAYER, this.stripIdentifierHash(player))
    this.io.to(this.gameId).emit(EVENTS.GAME.TOTAL_PLAYERS, this.players.length)
    socket.emit(EVENTS.GAME.SUCCESS_JOIN, this.gameId)
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
    const safeLeaderboard = this.players.map((p) => this.stripIdentifierHash(p))
    this.io
      .to(this.gameId)
      .emit(EVENTS.PLAYER.UPDATE_LEADERBOARD, { leaderboard: safeLeaderboard })
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

  // ── Crash-recovery snapshot ──────────────────────────────────────────────
  // Serialize only the STABLE, durable fields. The volatile socket id and the
  // live `connected` flag are intentionally dropped — on restore they are
  // reconstructed as id:"" / connected:false until a real socket re-binds via
  // the existing clientId-based reconnect flow. Pure read; no behaviour change.
  // I2: Intentionally omit identifierHash from snapshots (back-end tracking only,
  // never persisted; reconstructed on re-join if requireIdentifier is still true).
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
