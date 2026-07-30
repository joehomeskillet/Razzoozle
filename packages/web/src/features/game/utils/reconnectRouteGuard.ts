/**
 * Route-boundary guard for PLAYER.SUCCESS_RECONNECT (#978).
 *
 * The active route `gameIdParam` is authoritative. A delayed reconnect envelope
 * for a different game must be rejected before clearing the reconnect timeout
 * and before any player-store writes — otherwise `setGameId(reconnectGameId)`
 * makes a subsequent hydrate check tautologically pass and corrupts the store.
 */
export function isReconnectForActiveRoute(
  routeGameId: string | undefined,
  reconnectGameId: string,
): routeGameId is string {
  return (
    typeof routeGameId === "string" &&
    routeGameId.length > 0 &&
    routeGameId === reconnectGameId
  )
}
