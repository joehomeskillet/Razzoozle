// Barrel for the #23 public /submit media handlers. Each of the three new
// affordances lives in its own file (so WP-1/2/3 stay on disjoint files and can
// flood in parallel); this barrel imports + calls all three register functions.
// Wired into the handler registration site in src/index.ts alongside
// managerSocketHandlers / mediaSocketHandlers.
//
// NOTE: submitMedia.enhance / submitMedia.upload / submitMedia.edit are created
// by WP-1 / WP-2 / WP-3 respectively. WP-0 (this barrel) only references them.
import { registerEditHandlers } from "@razzia/socket/handlers/submitMedia.edit"
import { registerEnhanceHandlers } from "@razzia/socket/handlers/submitMedia.enhance"
import { registerUploadHandlers } from "@razzia/socket/handlers/submitMedia.upload"
import type { SocketContext } from "@razzia/socket/handlers/types"

export const registerSubmitMediaHandlers = (ctx: SocketContext): void => {
  registerEnhanceHandlers(ctx)
  registerUploadHandlers(ctx)
  registerEditHandlers(ctx)
}
