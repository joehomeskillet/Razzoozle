import { EVENTS } from "@razzoozle/common/constants"
import type { Socket } from "@razzoozle/common/types/game/socket"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  devApiKey,
  getMediaList,
  isDevMode,
  readPlugins,
} from "@razzoozle/socket/services/config"
import {
  readGameConfig,
  readMergedAchievements,
  readQuizzMeta,
  readResultsMeta,
  readSubmissionsMeta,
  readThemeTemplatesMeta,
} from "@razzoozle/socket/services/storage/config-read"

const getClientId = (socket: SocketContext["socket"]) =>
  socket.handshake.auth.clientId as string

// P3 — every read below now routes through the config-read facade (async;
// pg-native when DATABASE_MODE is pg/pg-only, same sync file read otherwise).
// ALL callers must `await emitConfig(...)` — see handlers/quizz.ts,
// catalog.ts, results.ts, theme-revision.ts, manager/theme.ts,
// theme-template.ts, manager/moderation.ts, manager/auth.ts.
export const emitConfig = async (socket: SocketContext["socket"]) => {
  const gameConfig = await readGameConfig()
  return socket.emit(EVENTS.MANAGER.CONFIG, {
    quizz: await readQuizzMeta(),
    results: await readResultsMeta(),
    submissions: await readSubmissionsMeta(),
    media: getMediaList(),
    themeTemplates: await readThemeTemplatesMeta(),
    teamMode: gameConfig.teamMode,
    lowLatencyEnabled: gameConfig.lowLatencyMode.enabled,
    randomizeAnswers: gameConfig.randomizeAnswers ?? false,
    joinLocked: gameConfig.joinLocked ?? false,
    scoringMode: gameConfig.scoringMode ?? "speed",
    achievements: await readMergedAchievements(),
    devMode: isDevMode(),
    devApiKey: devApiKey(),
    plugins: readPlugins(),
  })
}

// Auth model is shared by every manager-equivalent client. The Raspberry Pi
// "satellite" display (kiosk on a beamer/TV, see ../../web .../pages/satellite)
// is just another socket that runs through the exact same MANAGER.AUTH ->
// manager.login -> withAuth path below; it carries a credential in its handshake
// instead of a typed password but gets NO special bypass here. The Pi image is
// an optional, isolated add-on under repo-root satellite/ and does not change
// this server. Keep this class behavior-stable so manager auth stays unchanged.
class Manager {
  private loggedClients = new Set<string>()

  isLogged(socket: Socket) {
    return this.loggedClients.has(getClientId(socket))
  }

  // Session check by clientId alone (no socket) — used by the manager-gated HTTP
  // skeleton endpoints, which authenticate via the same durable clientId the
  // socket handshake carries (set by manager.login on MANAGER.AUTH success).
  isLoggedClientId(clientId: string) {
    return this.loggedClients.has(clientId)
  }

  login(socket: Socket) {
    this.loggedClients.add(getClientId(socket))
  }

  logout(socket: Socket) {
    this.loggedClients.delete(getClientId(socket))
  }

  withAuth<T extends unknown[]>(
    socket: Socket,
    handler: (..._args: T) => void,
  ) {
    return (..._args: T) => {
      if (!this.isLogged(socket)) {
        socket.emit(EVENTS.MANAGER.UNAUTHORIZED)

        return
      }

      handler(..._args)
    }
  }
}

export default new Manager()
