import type Game from "@razzoozle/socket/services/game"

export interface EmptyGame {
  since: number
  game: Game
}

// A satellite display ("Raspberry Pi" kiosk) that has announced a pairing code
// but has not yet been paired to a game by a manager.
export interface DisplayPairing {
  socketId: string
  createdAt: number
}

// WP-15 — a satellite display that HAS been paired to a game and is emitting a
// periodic heartbeat (DISPLAY.PING). Tracked purely in memory and DELIBERATELY
// excluded from the crash-recovery snapshot (ephemeral, re-established by the
// client re-pinging after a restart — compare the bot-snapshot-exclusion rule).
export interface PairedDisplay {
  socketId: string
  gameId: string
  name: string
  pairedAt: number // dayjs().unix()
  lastPingAt: number // dayjs().unix()
}
