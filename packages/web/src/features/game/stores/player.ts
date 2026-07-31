import type { StatusDataMap } from "@razzoozle/common/types/game/status"
import type {
  PowerupApplied,
  PowerupOffer,
  PowerupOffered,
  PowerupSelected,
  FlowerBattlePlayerStatus,
  RosterEntry,
} from "@razzoozle/common/types/game/socket"
import {
  createStatus,
  type Status,
} from "@razzoozle/web/features/game/utils/createStatus"
import { create } from "zustand"

interface PlayerState {
  username?: string
  points?: number
  avatar?: string
}

/** Snapshot of SUCCESS_ROOM so Username can apply klassen/roster after Room unmounts. */
export interface PendingRoom {
  gameId: string
  klassen: boolean
  roster: RosterEntry[]
  requireIdentifier: boolean
}

/**
 * Majority-locked power-up selection for this player's own team (WP #942
 * target vote). `optionId` stays the raw wire string — the route narrows it
 * via `isPowerupType` before building the UI's `TargetVoteSelection`.
 */
export interface FlowerBattlePowerupSelection {
  offerId: string
  optionId: string
  selectedAtServerMs: number
}

/**
 * Open power-up offer + locked selection for this player's own team
 * (WP-946-C4). Fed only by POWERUP_* S2C envelopes whose `teamId` matches the
 * personalized `flowerBattlePlayerStatus.teamId`; cleared on applied /
 * game-completed / join / reset.
 */
export interface FlowerBattlePowerupState {
  offer: PowerupOffer | null
  selection: FlowerBattlePowerupSelection | null
}

/**
 * Client-derived anchors for `receiveFlowerBattlePowerupSelected`.
 * The live rust emitter today sends all fields, but anchors keep compatibility
 * should emit gaps reappear.
 */
export interface FlowerBattlePowerupSelectedAnchors {
  fallbackOfferId: string | null
  localSelectedAtServerMs: number
}

interface PlayerStore<T> {
  gameId: string | null
  player: PlayerState | null
  status: Status<T> | null
  /** Last SUCCESS_ROOM payload (consumed by Username on mount). */
  pendingRoom: PendingRoom | null
  /**
   * Personalized FlowerBattle status for this player socket (WP-946-C1).
   * Null outside Flower Battle or after clear/reset/join/route leave.
   */
  flowerBattlePlayerStatus: FlowerBattlePlayerStatus | null

  /** Changing the game id also drops Flower status (no cross-game leak). */
  setGameId: (_gameId: string | null) => void

  setPlayer: (_state: PlayerState) => void
  login: (_username: string) => void
  /**
   * Called when SUCCESS_ROOM arrives. Sets gameId + player shell so the auth
   * page swaps Room → Username, and stashes room flags for Username to read
   * (SUCCESS_ROOM is not re-emitted after the swap).
   */
  join: (_gameId: string, _room?: Partial<PendingRoom> | null) => void
  clearPendingRoom: () => void
  updatePoints: (_points: number) => void
  setAvatar: (_avatar: string) => void

  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void

  /** Own-team power-up vote state (WP-946-C4). */
  flowerBattlePowerup: FlowerBattlePowerupState

  /** Unconditional write. Guarded paths prefer hydrate/receive. */
  setFlowerBattlePlayerStatus: (_status: FlowerBattlePlayerStatus) => void
  /** Drop Flower status so Classic/next game cannot retain it. */
  clearFlowerBattlePlayerStatus: () => void
  /**
   * Reconnect hydrate (WP-946-C1-R1). Sets only when the payload's gameId
   * matches both expectedGameId and the store gameId; clears on absent or
   * mismatch so a Classic reconnect or foreign payload cannot retain/leak
   * Flower state. Same-game non-increasing revisions are ignored.
   */
  hydrateFlowerBattlePlayerStatus: (
    _status: FlowerBattlePlayerStatus | undefined,
    _expectedGameId: string,
  ) => void
  /**
   * Live `game:flowerBattle:playerStatus` path.
   * Accepts only when payload.gameId equals both routeGameId and store gameId.
   * Same-game non-increasing revisions are ignored.
   */
  receiveFlowerBattlePlayerStatus: (
    _status: FlowerBattlePlayerStatus,
    _routeGameId: string,
  ) => void
  /**
   * Live `game:flowerBattle:powerupOffered` path. Stores the offer only when
   * the payload's gameId/teamId match the active route, store gameId, and the
   * current player's team.
   */
  receiveFlowerBattlePowerupOffered: (
    _payload: PowerupOffered,
    _routeGameId: string,
  ) => void
  /**
   * Live `game:flowerBattle:powerupSelected` path. Closes option vote and stores
   * target-selection data. Anchors support backfill if the emitter temporarily
   * omits fields.
   */
  receiveFlowerBattlePowerupSelected: (
    _payload: PowerupSelected,
    _routeGameId: string,
    _anchors: FlowerBattlePowerupSelectedAnchors,
  ) => void
  /** Shared clear for `game:flowerBattle:powerupApplied` / `gameCompleted`. */
  receiveFlowerBattlePowerupApplied: (
    _payload: Pick<PowerupApplied, "gameId">,
    _routeGameId: string,
  ) => void

  reset: () => void
}

/** Shared empty vote state — never mutated, safe to reuse by reference. */
const NO_FLOWER_POWERUP: FlowerBattlePowerupState = {
  offer: null,
  selection: null,
}

const initialState = {
  gameId: null as string | null,
  player: null as PlayerState | null,
  status: null as Status<StatusDataMap> | null,
  pendingRoom: null as PendingRoom | null,
  flowerBattlePlayerStatus: null as FlowerBattlePlayerStatus | null,
  flowerBattlePowerup: NO_FLOWER_POWERUP,
}

const CANONICAL_REVISION = /^(0|[1-9]\d*)$/

function parseRevision(revision: string): bigint | null {
  if (
    typeof revision !== "string" ||
    !CANONICAL_REVISION.test(revision)
  ) {
    return null
  }
  return BigInt(revision)
}

function shouldIgnoreRevision(
  current: FlowerBattlePlayerStatus | null,
  incoming: FlowerBattlePlayerStatus,
): boolean {
  const incomingRevision = parseRevision(incoming.revision)
  if (incomingRevision === null) {
    return true
  }
  if (!current || current.gameId !== incoming.gameId) {
    return false
  }

  const currentRevision = parseRevision(current.revision)
  return currentRevision !== null && incomingRevision <= currentRevision
}

/**
 * Fail-closed gate for team-scoped POWERUP_* envelopes:
 * payload must match route + store and the player's own team.
 */
function isOwnFlowerBattleEnvelope(
  state: {
    gameId: string | null
    flowerBattlePlayerStatus: FlowerBattlePlayerStatus | null
  },
  routeGameId: string,
  payloadGameId: string,
  payloadTeamId: string,
): boolean {
  if (payloadGameId !== routeGameId || payloadGameId !== state.gameId) {
    return false
  }
  const ownTeam = state.flowerBattlePlayerStatus?.teamId
  return ownTeam != null && ownTeam === payloadTeamId
}

export const usePlayerStore = create<PlayerStore<StatusDataMap>>((set) => ({
  ...initialState,

  setGameId: (gameId) =>
    set((state) =>
      // A different game must not inherit Flower status from the prior one.
      state.gameId === gameId
        ? { gameId }
        : {
            gameId,
            flowerBattlePlayerStatus: null,
            flowerBattlePowerup: NO_FLOWER_POWERUP,
          },
    ),

  setPlayer: (player: PlayerState) => set({ player }),
  login: (username) =>
    set((state) => ({
      player: { ...state.player, username },
    })),

  join: (gameId, room) => {
    const pendingRoom: PendingRoom | null = room
      ? {
          gameId,
          klassen: Boolean(room.klassen),
          roster: Array.isArray(room.roster) ? room.roster : [],
          requireIdentifier: Boolean(room.requireIdentifier),
        }
      : null
    set((state) => ({
      gameId,
      player: { ...state.player, points: 0 },
      pendingRoom,
      // New game must not inherit Flower status from a prior session.
      flowerBattlePlayerStatus: null,
      flowerBattlePowerup: NO_FLOWER_POWERUP,
    }))
  },

  clearPendingRoom: () => set({ pendingRoom: null }),

  updatePoints: (points) =>
    set((state) => ({
      player: { ...state.player, points },
    })),

  setAvatar: (avatar) =>
    set((state) => ({
      player: { ...state.player, avatar },
    })),

  setStatus: (name, data) => set({ status: createStatus(name, data) }),

  setFlowerBattlePlayerStatus: (status) =>
    set({ flowerBattlePlayerStatus: status }),

  clearFlowerBattlePlayerStatus: () =>
    set({
      flowerBattlePlayerStatus: null,
      flowerBattlePowerup: NO_FLOWER_POWERUP,
    }),

  hydrateFlowerBattlePlayerStatus: (status, expectedGameId) =>
    set((state) => {
      // Set only on a full match (payload ↔ expected ↔ store); otherwise
      // clear so absent (Classic) or mismatched state cannot survive.
      if (
        !status ||
        status.gameId !== expectedGameId ||
        status.gameId !== state.gameId
      ) {
        return {
          flowerBattlePlayerStatus: null,
          flowerBattlePowerup: NO_FLOWER_POWERUP,
        }
      }

      if (shouldIgnoreRevision(state.flowerBattlePlayerStatus, status)) {
        return state
      }

      return { flowerBattlePlayerStatus: status }
    }),

  receiveFlowerBattlePowerupOffered: (payload, routeGameId) =>
    set((state) => {
      if (
        !isOwnFlowerBattleEnvelope(
          state,
          routeGameId,
          payload.gameId,
          payload.teamId,
        )
      ) {
        return state
      }

      return {
        flowerBattlePowerup: { offer: payload.offer, selection: null },
      }
    }),

  receiveFlowerBattlePowerupSelected: (payload, routeGameId, anchors) =>
    set((state) => {
      if (
        !isOwnFlowerBattleEnvelope(
          state,
          routeGameId,
          payload.gameId,
          payload.teamId,
        )
      ) {
        return state
      }

      return {
        flowerBattlePowerup: {
          offer: null,
          selection: {
            offerId:
              payload.offerId ??
              anchors.fallbackOfferId ??
              `selected-${Math.round(
                payload.selectedAtServerMs ?? anchors.localSelectedAtServerMs,
              )}`,
            optionId: payload.optionId,
            selectedAtServerMs:
              payload.selectedAtServerMs ?? anchors.localSelectedAtServerMs,
          },
        },
      }
    }),

  receiveFlowerBattlePowerupApplied: (payload, routeGameId) =>
    set((state) => {
      if (routeGameId !== state.gameId || payload.gameId !== state.gameId) {
        return state
      }
      if (!state.flowerBattlePowerup.offer && !state.flowerBattlePowerup.selection) {
        return state
      }
      return { flowerBattlePowerup: NO_FLOWER_POWERUP }
    }),

  receiveFlowerBattlePlayerStatus: (status, routeGameId) =>
    set((state) => {
      // Live path: payload must match both the active route and store gameId.
      if (status.gameId !== routeGameId || status.gameId !== state.gameId) {
        return state
      }

      if (shouldIgnoreRevision(state.flowerBattlePlayerStatus, status)) {
        return state
      }

      return { flowerBattlePlayerStatus: status }
    }),

  reset: () => set(initialState),
}))
