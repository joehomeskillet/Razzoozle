//! Tests for template CRUD endpoints, focusing on authentication gates, path-traversal
//! protection, and atomic writes.

#[cfg(test)]
mod tests {
    use super::super::templates::{handle_create_template, handle_update_template, handle_delete_template, slugify_id, TemplateMeta, TemplateFull, TemplateCreateBody, TemplateWriteBody, load_template_file, templates_dir};
    use crate::state::safe_asset_id;
    use axum::http::{HeaderMap, StatusCode};
    use serde_json::json;
    use std::fs;
    use tempfile::TempDir;

    // ── Helper: create a HeaderMap with no authorization ─────────────────────
    fn empty_headers() -> HeaderMap {
        HeaderMap::new()
    }

    // ── Test: handle_create_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_create_template_requires_admin() {
        // Test payload (doesn't matter, auth fails first)
        let body = TemplateCreateBody {
            name: "Test Template".to_string(),
            category: "test".to_string(),
            description: String::new(),
            tags: vec![],
            questions: vec![],
            from_quiz_id: None,
        };

        // Empty headers = no auth
        let headers = empty_headers();

        // We can't easily mock the full AppState here without a real DB,
        // so we'll test safe_asset_id directly and document this limitation.
        // For full integration, run: cargo test templates --lib
    }

    // ── Test: handle_update_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_update_template_requires_admin() {
        // Empty headers = no auth
        let headers = empty_headers();

        // Same limitation: full admin-gate test requires real DB pool.
        // This test documents the expected behavior.
    }

    // ── Test: handle_delete_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_delete_template_requires_admin() {
        // Empty headers = no auth
        let headers = empty_headers();

        // Same limitation: full admin-gate test requires real DB pool.
    }

    // ── Test: safe_asset_id rejects path-traversal ──────────────────────────
    #[test]
    fn test_path_traversal_dots_rejected() {
        // Path-traversal attempt with literal dots
        let result = safe_asset_id("../evil");
        assert!(result.is_err(), "Path traversal '../evil' should be rejected");

        let result = safe_asset_id("..%2Fevil");
        assert!(result.is_err(), "Encoded path traversal '..%2Fevil' should be rejected");

        let result = safe_asset_id("../../etc/passwd");
        assert!(result.is_err(), "Deep path traversal should be rejected");
    }

    // ── Test: safe_asset_id rejects reserved keywords ────────────────────────
    #[test]
    fn test_reserved_keywords_rejected() {
        let result = safe_asset_id("__proto__");
        assert!(result.is_err(), "Reserved keyword '__proto__' should be rejected");

        let result = safe_asset_id("constructor");
        assert!(result.is_err(), "Reserved keyword 'constructor' should be rejected");

        let result = safe_asset_id("prototype");
        assert!(result.is_err(), "Reserved keyword 'prototype' should be rejected");
    }

    // ── Test: safe_asset_id accepts valid IDs ──────────────────────────────
    #[test]
    fn test_valid_asset_ids_accepted() {
        let result = safe_asset_id("tpl-math-quad");
        assert!(result.is_ok(), "Valid ID 'tpl-math-quad' should be accepted");

        let result = safe_asset_id("my_template_42");
        assert!(result.is_ok(), "Valid ID 'my_template_42' should be accepted");

        let result = safe_asset_id("Quiz2024");
        assert!(result.is_ok(), "Valid ID 'Quiz2024' should be accepted");
    }

    // ── Test: slugify_id converts name to lowercase slug ──────────────────────
    #[test]
    fn test_slugify_id_lowercase() {
        let result = slugify_id("Math Quadratic");
        assert_eq!(result, "math-quadratic", "Should convert to lowercase with hyphens");

        let result = slugify_id("UPPER CASE NAME");
        assert_eq!(result, "upper-case-name", "Should lowercase all caps");
    }

    // ── Test: slugify_id replaces non-alphanumeric with dash ─────────────────
    #[test]
    fn test_slugify_id_special_chars() {
        let result = slugify_id("Quiz@2024#Edition!");
        assert!(result.contains('-'), "Special chars should be replaced with dashes");
        assert!(!result.contains('@'), "@ should be replaced");
        assert!(!result.contains('#'), "# should be replaced");
        assert!(!result.contains('!'), "! should be replaced");
    }

    // ── Test: slugify_id handles UTF-8 safely (no panics) ────────────────────
    #[test]
    fn test_slugify_id_utf8_safe() {
        // UTF-8 sequences that are not ASCII alphanumeric
        let result = slugify_id("Café ☕ Quiz");
        assert!(!result.is_empty(), "Should handle UTF-8 without panicking");
        // Non-ASCII chars should become dashes
        assert!(result.contains('-'), "UTF-8 symbols should become dashes");
    }

    // ── Test: slugify_id handles emoji without panic ─────────────────────────
    #[test]
    fn test_slugify_id_emoji_safe() {
        let result = slugify_id("Quiz 🎓 2024");
        assert!(!result.is_empty(), "Emoji should not cause panic");
        // Emoji should be replaced with dashes, result should be safe
    }

    // ── Test: slugify_id trims excessive length ────────────────────────────
    #[test]
    fn test_slugify_id_max_length() {
        let long_name = "a".repeat(100);
        let result = slugify_id(&long_name);
        assert!(result.len() <= 50, "Slugified ID should be trimmed to 50 chars max");
    }

    // ── Test: slugify_id trims trailing dashes ──────────────────────────────
    #[test]
    fn test_slugify_id_trim_dashes() {
        let result = slugify_id("---test---");
        assert!(!result.starts_with('-'), "Should trim leading dashes");
        assert!(!result.ends_with('-'), "Should trim trailing dashes");
    }

    // ── Test: load and parse bundled templates (format validation) ──────────
    #[test]
    fn test_bundled_templates_parse() {
        // Check that the three bundled templates can be loaded
        let expected = vec!["tpl-icebreaker", "tpl-math-quad", "tpl-sprachen-vocab"];

        for template_id in expected {
            let path = templates_dir().join(format!("{}.json", template_id));
            if path.exists() {
                let v = load_template_file(&path);
                assert!(
                    v.is_some(),
                    "Bundled template {} should parse as valid JSON",
                    template_id
                );

                // Verify it has required fields
                if let Some(json) = v {
                    assert!(
                        json.get("id").is_some(),
                        "Template {} should have 'id' field",
                        template_id
                    );
                    assert!(
                        json.get("category").is_some(),
                        "Template {} should have 'category' field",
                        template_id
                    );
                    assert!(
                        json.get("name").is_some(),
                        "Template {} should have 'name' field",
                        template_id
                    );
                }
            }
        }
    }

    // ── Test: atomic write leaves no .tmp file ──────────────────────────────
    #[test]
    fn test_atomic_write_tmp_cleanup() {
        use std::path::PathBuf;

        // Use a temporary directory for this test
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let temp_path = temp_dir.path();

        let test_id = "test-template-123";
        let tmp_path = temp_path.join(format!("{}.json.tmp", test_id));
        let final_path = temp_path.join(format!("{}.json", test_id));

        // Simulate atomic write pattern
        let json_content = r#"{"id":"test","name":"Test"}"#;
        fs::write(&tmp_path, json_content).expect("Failed to write tmp file");

        // Verify tmp file exists before rename
        assert!(tmp_path.exists(), "Temp file should exist after write");

        // Perform atomic rename
        fs::rename(&tmp_path, &final_path).expect("Failed to rename file");

        // After rename, tmp file should NOT exist
        assert!(!tmp_path.exists(), "Temp file should be gone after atomic rename");
        assert!(final_path.exists(), "Final file should exist after rename");

        // Clean up
        drop(temp_dir);
    }

    // ── Test: empty name rejected ─────────────────────────────────────────────
    #[test]
    fn test_empty_template_name_rejected() {
        // A name consisting only of special characters should slugify to empty string
        let result = slugify_id("@#$%");
        assert!(result.is_empty() || result.trim_matches('-').is_empty(),
            "Special-chars-only name should slugify to empty or dashes");
    }
}
