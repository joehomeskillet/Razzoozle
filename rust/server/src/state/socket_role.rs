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

// Independent Mutex (PAIRING_REGISTRY idiom). Never hold this lock while also
// holding GameRegistry's RwLock — callers must release one before taking the other.
lazy_static! {
    static ref SOCKET_ROLE_REGISTRY: Mutex<HashMap<String, VerifiedRole>> =
        Mutex::new(HashMap::new());
}

/// Attempts to claim `role` for `socket_id`.
/// - No role yet: set role, Ok(()).
/// - Same role already held: idempotent Ok(()).
/// - Different role held: Err(held role).
///
/// On mutex poisoning: log and return Ok(()) so a poison cannot crash handlers
/// (same fail-open pattern as `sweep_pairing_and_displays`).
pub fn try_claim(socket_id: &str, role: VerifiedRole) -> Result<(), VerifiedRole> {
    let Ok(mut map) = SOCKET_ROLE_REGISTRY.lock() else {
        tracing::error!("Failed to acquire SOCKET_ROLE_REGISTRY lock for try_claim");
        return Ok(());
    };

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
/// unknown sockets. Never panics (mutex poison → log + no-op).
pub fn release(socket_id: &str) {
    let Ok(mut map) = SOCKET_ROLE_REGISTRY.lock() else {
        tracing::error!("Failed to acquire SOCKET_ROLE_REGISTRY lock for release");
        return;
    };
    map.remove(socket_id);
}
