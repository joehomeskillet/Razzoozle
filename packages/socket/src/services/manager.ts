import { EVENTS } from "@razzoozle/common/constants"
import type { Socket } from "@razzoozle/common/types/game/socket"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  getGameConfig,
  getMergedAchievements,
  getQuizzMeta,
  getMediaList,
  getResultsMeta,
  getSubmissionsMeta,
  getThemeTemplatesMeta,
  isDevMode,
} from "@razzoozle/socket/services/config"

const getClientId = (socket: SocketContext["socket"]) =>
  socket.handshake.auth.clientId as string

export const emitConfig = (socket: SocketContext["socket"]) =>
  socket.emit(EVENTS.MANAGER.CONFIG, {
    quizz: getQuizzMeta(),
    results: getResultsMeta(),
    submissions: getSubmissionsMeta(),
    media: getMediaList(),
    themeTemplates: getThemeTemplatesMeta(),
    teamMode: getGameConfig().teamMode,
    achievements: getMergedAchievements(),
    devMode: isDevMode(),
  })

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
