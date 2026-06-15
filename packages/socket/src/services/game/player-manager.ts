import { EVENTS } from "@razzia/common/constants"
import type { Player } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { usernameValidator } from "@razzia/common/validators/auth"

export class PlayerManager {
  private readonly io: Server
  private readonly gameId: string
  private readonly getManagerId: () => string
  private players: Player[] = []

  constructor(io: Server, gameId: string, getManagerId: () => string) {
    this.io = io
    this.gameId = gameId
    this.getManagerId = getManagerId
  }

  join(socket: Socket, username: string, avatar?: string): void {
    const clientId = socket.handshake.auth.clientId as string

    if (this.findByClientId(clientId)) {
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

    this.players.push(player)
    this.io.to(this.getManagerId()).emit(EVENTS.MANAGER.NEW_PLAYER, player)
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
    this.io.to(this.getManagerId()).emit(EVENTS.MANAGER.NEW_PLAYER, player)
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
    this.io.to(this.getManagerId()).emit(EVENTS.MANAGER.NEW_PLAYER, player)
    this.io
      .to(this.gameId)
      .emit(EVENTS.PLAYER.UPDATE_LEADERBOARD, { leaderboard: this.players })
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
