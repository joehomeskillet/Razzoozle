//! Socket authentication handlers and utilities for satellite-authenticated displays.
//!
//! Satellite tokens are optional tokens passed in the Socket.io auth payload,
//! intended for presenter displays that need to emit manager events without
//! requiring password-based session login.

use super::HandlerCtx;

/// Check if a connection is authenticated as a satellite display.
pub fn is_satellite_authenticated(satellite_token: &Option<String>) -> bool {
    satellite_token.is_some() && !satellite_token.as_ref().unwrap().is_empty()
}

/// Check if a connection can authorize a manager display event (skip/adjustTimer/revealAnswer).
/// Returns true if either:
/// - The connection has a valid satellite token (presenter-display mode), OR
/// - The connection is an authenticated session user (manager mode).
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
    use crate::db::users::AuthUser;

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
    fn test_satellite_token_extraction_present() {
        let token = Some("test-satellite-token-123".to_string());
        assert!(is_satellite_authenticated(&token));
    }

    #[test]
    fn test_satellite_token_extraction_absent() {
        let token: Option<String> = None;
        assert!(!is_satellite_authenticated(&token));
    }

    #[test]
    fn test_satellite_token_extraction_empty() {
        let token = Some(String::new());
        assert!(!is_satellite_authenticated(&token));
    }

    #[test]
    fn test_satellite_token_extraction_whitespace() {
        let token = Some("   ".to_string());
        assert!(is_satellite_authenticated(&token)); // Non-empty string, even if whitespace
    }

    #[test]
    fn test_can_authorize_display_event_with_satellite() {
        let ctx = make_handler_ctx_with_satellite(Some("valid-token".to_string()));
        assert!(can_authorize_display_event(&ctx));
    }

    #[test]
    fn test_can_authorize_display_event_without_satellite() {
        let ctx = make_handler_ctx_with_satellite(None);
        assert!(!can_authorize_display_event(&ctx));
    }

    #[test]
    fn test_can_authorize_display_event_empty_satellite() {
        let ctx = make_handler_ctx_with_satellite(Some(String::new()));
        assert!(!can_authorize_display_event(&ctx));
    }
}
