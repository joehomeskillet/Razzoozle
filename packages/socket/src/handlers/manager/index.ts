import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { registerAuthHandlers } from "./auth"
import { registerGameHandlers } from "./games"
import { registerGenerateImageHandler } from "./generate-image"
import { registerModerationHandlers } from "./moderation"
import { registerPluginHandlers } from "./plugins"
import { registerSubmitQuestionHandler } from "./submit-question"
import { registerThemeHandlers } from "./theme"

export const managerSocketHandlers = (ctx: SocketContext) => {
  registerThemeHandlers(ctx)
  registerPluginHandlers(ctx)
  registerSubmitQuestionHandler(ctx)
  registerGenerateImageHandler(ctx)
  registerModerationHandlers(ctx)
  registerGameHandlers(ctx)
  registerAuthHandlers(ctx)
}
