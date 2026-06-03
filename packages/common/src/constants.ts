export const EVENTS = {
  GAME: {
    STATUS: "game:status",
    SUCCESS_ROOM: "game:successRoom",
    SUCCESS_JOIN: "game:successJoin",
    TOTAL_PLAYERS: "game:totalPlayers",
    ERROR_MESSAGE: "game:errorMessage",
    START_COOLDOWN: "game:startCooldown",
    COOLDOWN: "game:cooldown",
    RESET: "game:reset",
    UPDATE_QUESTION: "game:updateQuestion",
    PLAYER_ANSWER: "game:playerAnswer",
    CREATE: "game:create",
  },
  PLAYER: {
    SUCCESS_RECONNECT: "player:successReconnect",
    UPDATE_LEADERBOARD: "player:updateLeaderboard",
    JOIN: "player:join",
    LOGIN: "player:login",
    RECONNECT: "player:reconnect",
    LEAVE: "player:leave",
    SELECTED_ANSWER: "player:selectedAnswer",
  },
  MANAGER: {
    SUCCESS_RECONNECT: "manager:successReconnect",
    CONFIG: "manager:config",
    GAME_CREATED: "manager:gameCreated",
    STATUS_UPDATE: "manager:statusUpdate",
    NEW_PLAYER: "manager:newPlayer",
    REMOVE_PLAYER: "manager:removePlayer",
    ERROR_MESSAGE: "manager:errorMessage",
    PLAYER_KICKED: "manager:playerKicked",
    AUTH: "manager:auth",
    RECONNECT: "manager:reconnect",
    LEAVE: "manager:leave",
    KICK_PLAYER: "manager:kickPlayer",
    START_GAME: "manager:startGame",
    SET_AUTO: "manager:setAuto",
    ABORT_QUIZ: "manager:abortQuiz",
    NEXT_QUESTION: "manager:nextQuestion",
    SHOW_LEADERBOARD: "manager:showLeaderboard",
    GET_CONFIG: "manager:getConfig",
    LOGOUT: "manager:logout",
    UNAUTHORIZED: "manager:unauthorized",
    GET_THEME: "manager:getTheme",
    THEME: "manager:theme",
    SET_THEME: "manager:setTheme",
    SET_THEME_SUCCESS: "manager:setThemeSuccess",
    UPLOAD_BACKGROUND: "manager:uploadBackground",
    BACKGROUND_UPLOADED: "manager:backgroundUploaded",
    THEME_ERROR: "manager:themeError",
  },
  QUIZZ: {
    GET: "quizz:get",
    DATA: "quizz:data",
    SAVE: "quizz:save",
    SAVE_SUCCESS: "quizz:saveSuccess",
    UPDATE: "quizz:update",
    UPDATE_SUCCESS: "quizz:updateSuccess",
    DELETE: "quizz:delete",
    ERROR: "quizz:error",
  },
  RESULTS: {
    GET: "results:get",
    DATA: "results:data",
    DELETE: "results:delete",
  },
  DISPLAY: {
    REGISTER: "display:register",
    PAIR: "display:pair",
    PAIR_SUCCESS: "display:pairSuccess",
    PAIR_ERROR: "display:pairError",
    DISCONNECT: "display:disconnect",
  },
} as const

// A satellite display ("Raspberry Pi" kiosk) registers a short pairing code,
// then a manager pairs that code (with the manager password) so the display
// joins the game room. Codes expire after this many minutes.
export const DISPLAY_PAIRING_TTL_MINUTES = 5

export const MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
} as const

export const EXAMPLE_QUIZZ = {
  subject: "Example Quizz",
  questions: [
    {
      question: "What is good answer ?",
      answers: ["No", "Good answer", "No", "No"],
      solutions: [1],
      cooldown: 5,
      time: 15,
    },
    {
      question: "What is good answer with image ?",
      answers: ["No", "No", "No", "Good answer"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: "https://placehold.co/600x400.png",
      },
      solutions: [3],
      cooldown: 5,
      time: 20,
    },
    {
      question: "What is good answer with two answers ?",
      answers: ["Good answer", "No"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: "https://placehold.co/600x400.png",
      },
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Which of these are primary colors ?",
      answers: ["Red", "Green", "Blue", "Yellow"],
      solutions: [0, 2, 3],
      cooldown: 5,
      time: 20,
    },
  ],
} as const
