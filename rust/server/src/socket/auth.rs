//! Socket authentication handlers and utilities for satellite-authenticated displays.
//!
//! Satellite tokens are optional tokens passed in the Socket.io auth payload,
//! intended for presenter displays that need to emit manager events without
//! requiring password-based session login.

/// Check if a connection is authenticated as a satellite display.
pub fn is_satellite_authenticated(satellite_token: &Option<String>) -> bool {
    satellite_token.is_some() && !satellite_token.as_ref().unwrap().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
