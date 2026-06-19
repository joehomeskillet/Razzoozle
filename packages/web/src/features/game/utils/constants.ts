import { EVENTS } from "@razzoozle/common/constants"
import Answers from "@razzoozle/web/features/game/components/states/Answers"
import Leaderboard from "@razzoozle/web/features/game/components/states/Leaderboard"
import Paused from "@razzoozle/web/features/game/components/states/Paused"
import PlayerFinished from "@razzoozle/web/features/game/components/states/PlayerFinished"
import Podium from "@razzoozle/web/features/game/components/states/Podium"
import Prepared from "@razzoozle/web/features/game/components/states/Prepared"
import Question from "@razzoozle/web/features/game/components/states/Question"
import Responses from "@razzoozle/web/features/game/components/states/Responses"
import Result from "@razzoozle/web/features/game/components/states/Result"
import Room from "@razzoozle/web/features/game/components/states/Room"
import RoundRecap from "@razzoozle/web/features/game/components/states/RoundRecap"
import Start from "@razzoozle/web/features/game/components/states/Start"
import Wait from "@razzoozle/web/features/game/components/states/Wait"

import { STATUS } from "@razzoozle/common/types/game/status"

// Answer color/label data + helpers live in the leaf module ./answers to avoid
// an ESM import cycle (components import these AND are imported by the maps
// below). Re-exported here for backwards-compatible import sites.
export {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
  answerColor,
  answerLabel,
} from "./answers"

export const GAME_STATES = {
  status: {
    name: STATUS.WAIT,
    data: { text: "Waiting for the players" },
  },
  question: {
    current: 1,
    total: null,
  },
}

export const GAME_STATE_COMPONENTS = {
  [STATUS.SELECT_ANSWER]: Answers,
  [STATUS.SHOW_QUESTION]: Question,
  [STATUS.WAIT]: Wait,
  [STATUS.SHOW_START]: Start,
  [STATUS.SHOW_RESULT]: Result,
  [STATUS.SHOW_PREPARED]: Prepared,
  [STATUS.FINISHED]: PlayerFinished,
  // Host-triggered between-questions hold. Lives in the shared map so BOTH the
  // player route (gates on `name in GAME_STATE_COMPONENTS`) and the manager
  // presentation views (which spread this map) render the pause screen.
  [STATUS.PAUSED]: Paused,
}

export const GAME_STATE_COMPONENTS_MANAGER = {
  ...GAME_STATE_COMPONENTS,
  [STATUS.SHOW_ROOM]: Room,
  [STATUS.SHOW_RESPONSES]: Responses,
  [STATUS.SHOW_ROUND_RECAP]: RoundRecap,
  [STATUS.SHOW_LEADERBOARD]: Leaderboard,
  [STATUS.FINISHED]: Podium,
}

export const SFX = {
  ANSWERS: {
    MUSIC: "/sounds/answersMusic.mp3",
    SOUND: "/sounds/answersSound.mp3",
  },
  PODIUM: {
    THREE: "/sounds/three.mp3",
    SECOND: "/sounds/second.mp3",
    FIRST: "/sounds/first.mp3",
    SNEAR_ROOL: "/sounds/snearRoll.mp3",
  },
  RESULTS_SOUND: "/sounds/results.mp3",
  SHOW_SOUND: "/sounds/show.mp3",
  BOUMP_SOUND: "/sounds/boump.mp3",
  TIERS: {
    BRONZE: "/sounds/bronze.mp3",
    SILVER: "/sounds/silver.mp3",
    GOLD: "/sounds/gold.mp3",
    DIAMANT: "/sounds/diamant.mp3",
  },
} as const

export const MANAGER_SKIP_EVENTS = {
  [STATUS.SHOW_ROOM]: EVENTS.MANAGER.START_GAME,
  [STATUS.SELECT_ANSWER]: EVENTS.MANAGER.ABORT_QUIZ,
  [STATUS.SHOW_RESPONSES]: EVENTS.MANAGER.SHOW_LEADERBOARD,
  [STATUS.SHOW_ROUND_RECAP]: EVENTS.MANAGER.SHOW_LEADERBOARD,
  [STATUS.SHOW_LEADERBOARD]: EVENTS.MANAGER.NEXT_QUESTION,
} as const satisfies Partial<
  Record<keyof typeof GAME_STATE_COMPONENTS_MANAGER, string>
>

export function isKeyOf<T extends object>(
  obj: T,
  key: string,
): key is keyof T & string {
  return key in obj
}

export const MANAGER_SKIP_BTN = {
  [STATUS.SHOW_ROOM]: "game:startGame",
  [STATUS.SHOW_START]: null,
  [STATUS.SHOW_PREPARED]: null,
  [STATUS.SHOW_QUESTION]: null,
  [STATUS.SELECT_ANSWER]: "common:skip",
  [STATUS.SHOW_RESULT]: null,
  [STATUS.SHOW_RESPONSES]: "common:next",
  [STATUS.SHOW_ROUND_RECAP]: "common:next",
  [STATUS.SHOW_LEADERBOARD]: "common:next",
  [STATUS.FINISHED]: "common:exit",
  [STATUS.WAIT]: null,
  // No advance/skip CTA while paused — the host resumes via the QR overlay's
  // Resume button instead.
  [STATUS.PAUSED]: null,
}
