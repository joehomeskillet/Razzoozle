//! Socket authentication handlers and utilities for satellite-authenticated displays.
//!
//! Satellite tokens are optional tokens passed in the Socket.io auth payload,
//! intended for presenter displays that need to emit manager events without
//! requiring password-based session login.
//!
//! Security: satellite tokens are validated against a configured server-side secret
//! (SATELLITE_TOKEN env var) using constant-time comparison. If the env var is not
//! set, satellite authentication is always denied (fail-closed).

use super::HandlerCtx;
use subtle::ConstantTimeEq;
use tracing::debug;

/// Get the configured satellite token secret from environment.
/// Returns None if SATELLITE_TOKEN is not set (fail-closed: no satellite auth allowed).
fn get_satellite_secret() -> Option<String> {
    std::env::var("SATELLITE_TOKEN").ok()
}

/// Perform constant-time comparison of two byte slices.
/// Returns false if lengths differ (avoids early-exit timing leak).
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    bool::from(left.ct_eq(right))
}

/// Check if a presented satellite token is valid against the configured server secret.
/// - If SATELLITE_TOKEN env var is not set: return false (fail-closed)
/// - If token is present and matches secret (constant-time): return true
/// - Otherwise: return false
/// Token value is never logged.
pub fn is_satellite_authenticated(satellite_token: &Option<String>) -> bool {
    let Some(ref presented_token) = satellite_token else {
        return false;
    };

    let Some(secret) = get_satellite_secret() else {
        debug!("satellite auth denied: SATELLITE_TOKEN env not configured");
        return false;
    };

    // Constant-time comparison: never log the actual token
    let is_valid = constant_time_eq(presented_token.as_bytes(), secret.as_bytes());
    if !is_valid {
        debug!("satellite auth denied: token mismatch (not logging values)");
    }
    is_valid
}

/// Check if a connection can authorize a manager display event (skip/adjustTimer/revealAnswer).
/// Returns true if the connection has a valid satellite token.
///
/// This allows displays that don't have a password login to still emit manager
/// control events by presenting a valid satellite token.
pub fn can_authorize_display_event(ctx: &HandlerCtx) -> bool {
    is_satellite_authenticated(&ctx.satellite_token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn make_handler_ctx_with_satellite(token: Option<String>) -> HandlerCtx {
        HandlerCtx {
            registry: Arc::new(RwLock::new(Default::default())),
            io: Default::default(),
            client_id: "test-client".to_string(),
            db_pool: None,
            session_token: None,
            satellite_token: token,
            user_cache: Arc::new(RwLock::new(None)),
        }
    }

    #[test]
    fn test_constant_time_eq_matching() {
        assert!(constant_time_eq(b"secret", b"secret"));
    }

    #[test]
    fn test_constant_time_eq_nonmatching() {
        assert!(!constant_time_eq(b"secret", b"wrong"));
    }

    #[test]
    fn test_constant_time_eq_different_lengths() {
        assert!(!constant_time_eq(b"short", b"much-longer-string"));
    }

    #[test]
    fn test_satellite_token_no_env_var() {
        // Clear the env var if it's set
        std::env::remove_var("SATELLITE_TOKEN");
        let token = Some("any-token".to_string());
        assert!(!is_satellite_authenticated(&token), "should deny when SATELLITE_TOKEN env not set");
    }

    #[test]
    fn test_satellite_token_absent() {
        std::env::remove_var("SATELLITE_TOKEN");
        let token: Option<String> = None;
        assert!(!is_satellite_authenticated(&token), "should deny when no token provided");
    }

    #[test]
    fn test_satellite_token_valid_against_env() {
        // Set a known secret for this test
        std::env::set_var("SATELLITE_TOKEN", "test-secret-123");
        let token = Some("test-secret-123".to_string());
        assert!(
            is_satellite_authenticated(&token),
            "should allow token matching SATELLITE_TOKEN env"
        );
        std::env::remove_var("SATELLITE_TOKEN");
    }

    #[test]
    fn test_satellite_token_invalid_against_env() {
        std::env::set_var("SATELLITE_TOKEN", "test-secret-123");
        let token = Some("wrong-token".to_string());
        assert!(
            !is_satellite_authenticated(&token),
            "should deny token not matching SATELLITE_TOKEN env"
        );
        std::env::remove_var("SATELLITE_TOKEN");
    }

    #[test]
    fn test_can_authorize_display_event_with_valid_token() {
        std::env::set_var("SATELLITE_TOKEN", "test-secret-123");
        let ctx = make_handler_ctx_with_satellite(Some("test-secret-123".to_string()));
        assert!(can_authorize_display_event(&ctx), "should authorize with valid token");
        std::env::remove_var("SATELLITE_TOKEN");
    }

    #[test]
    fn test_can_authorize_display_event_without_token() {
        std::env::remove_var("SATELLITE_TOKEN");
        let ctx = make_handler_ctx_with_satellite(None);
        assert!(
            !can_authorize_display_event(&ctx),
            "should deny without satellite token"
        );
    }

    #[test]
    fn test_can_authorize_display_event_without_env_secret() {
        std::env::remove_var("SATELLITE_TOKEN");
        let ctx = make_handler_ctx_with_satellite(Some("any-token".to_string()));
        assert!(
            !can_authorize_display_event(&ctx),
            "should deny when server SATELLITE_TOKEN not configured"
        );
    }
}
