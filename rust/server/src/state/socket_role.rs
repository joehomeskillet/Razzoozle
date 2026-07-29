//! Per-socket verified role registry — at most one VerifiedRole per SocketId.

use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifiedRole {
    Manager,
    Player,
    Display,
}

// Independent Mutex (PAIRING_REGISTRY idiom). Blatt-Lock: innerhalb dieses
// Moduls wird nie eine weitere Sperre genommen; der Aufruf ist daher auch
// unter gehaltenem Registry-Guard sicher.
lazy_static! {
    static ref SOCKET_ROLE_REGISTRY: Mutex<HashMap<String, VerifiedRole>> =
        Mutex::new(HashMap::new());
}

/// Attempts to claim `role` for `socket_id`.
/// - No role yet: set role, Ok(()).
/// - Same role already held: idempotent Ok(()).
/// - Different role held: Err(held role).
///
/// On mutex poisoning: recover the map and continue. HashMap has no invariant
/// that a panic within the critical section could violate, so recovery is safe.
pub fn try_claim(socket_id: &str, role: VerifiedRole) -> Result<(), VerifiedRole> {
    let mut map = SOCKET_ROLE_REGISTRY
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    match map.get(socket_id) {
        None => {
            map.insert(socket_id.to_string(), role);
            Ok(())
        }
        Some(&held) if held == role => Ok(()),
        Some(&held) => Err(held),
    }
}

/// Removes the role binding for `socket_id` if present. Idempotent no-op on
/// unknown sockets. On mutex poisoning: recover and continue.
pub fn release(socket_id: &str) {
    let mut map = SOCKET_ROLE_REGISTRY
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    map.remove(socket_id);
}

/// Reads the current role assigned to `socket_id`, if any.
/// On mutex poisoning: recover and return None.
pub fn role_of(socket_id: &str) -> Option<VerifiedRole> {
    let map = SOCKET_ROLE_REGISTRY
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    map.get(socket_id).copied()
}
