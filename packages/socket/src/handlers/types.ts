import type { Server, Socket } from "@razzoozle/common/types/game/socket"

export interface SocketContext {
  io: Server
  socket: Socket
}

export type SocketHandler = (_context: SocketContext) => void
