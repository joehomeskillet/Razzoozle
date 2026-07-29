//! Quiz template library — file-backed under config/templates/*.json

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use super::{get_config_path, AppState};
use crate::state::safe_asset_id;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TemplateMeta {
    pub id: String,
    pub category: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "questionCount")]
    pub question_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TemplateFull {
    pub id: String,
    pub category: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "questionCount")]
    pub question_count: usize,
    pub questions: Vec<Value>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateWriteBody {
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub questions: Vec<Value>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateCreateBody {
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub questions: Vec<Value>,
    #[serde(rename = "fromQuizId")]
    #[serde(default)]
    pub from_quiz_id: Option<String>,
}

fn templates_dir() -> PathBuf {
    for c in [
        PathBuf::from("config/templates"),
        PathBuf::from("../config/templates"),
    ] {
        if c.is_dir() {
            return c;
        }
    }
    PathBuf::from("config/templates")
}

fn load_template_file(path: &std::path::Path) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Slugify a name: lowercase, replace non-alphanumeric with `-`, trim to 50 chars (UTF-8 safe).
fn slugify_id(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .chars()
        .take(50)
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Find next available template ID by checking for collisions on disk.
fn next_template_id(base: &str) -> String {
    let dir = templates_dir();
    let mut attempt = base.to_string();
    let mut counter = 1;

    while dir.join(format!("{}.json", attempt)).exists() {
        attempt = format!("{}-{}", base, counter);
        counter += 1;
    }

    attempt
}

pub async fn handle_list_templates() -> Result<Json<Vec<TemplateMeta>>, (StatusCode, String)> {
    let dir = templates_dir();
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for ent in rd.flatten() {
            let path = ent.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Some(v) = load_template_file(&path) {
                let questions = v.get("questions").and_then(|q| q.as_array());
                out.push(TemplateMeta {
                    id: v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    category: v
                        .get("category")
                        .and_then(|x| x.as_str())
                        .unwrap_or("custom")
                        .to_string(),
                    name: v
                        .get("name")
                        .and_then(|x| x.as_str())
                        .unwrap_or("Template")
                        .to_string(),
                    description: v
                        .get("description")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    tags: v
                        .get("tags")
                        .and_then(|x| x.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|t| t.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                    question_count: questions.map(|a| a.len()).unwrap_or(0),
                });
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

pub async fn handle_get_template(
    Path(id): Path<String>,
) -> Result<Json<TemplateFull>, (StatusCode, String)> {
    safe_asset_id(&id).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let path = templates_dir().join(format!("{}.json", id));
    let v = load_template_file(&path)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Template not found".to_string()))?;

    let questions = v
        .get("questions")
        .and_then(|q| q.as_array())
        .cloned()
        .unwrap_or_default();

    let full = TemplateFull {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        category: v
            .get("category")
            .and_then(|x| x.as_str())
            .unwrap_or("custom")
            .to_string(),
        name: v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("Template")
            .to_string(),
        description: v
            .get("description")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        tags: v
            .get("tags")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|t| t.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        question_count: questions.len(),
        questions,
    };
    Ok(Json(full))
}

pub async fn handle_create_template(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<TemplateCreateBody>,
) -> Result<(StatusCode, Json<TemplateFull>), (StatusCode, String)> {
    // Admin-gate
    crate::auth::ensure_admin_user(&headers, &state.db_pool)
        .await
        .ok_or_else(|| (StatusCode::FORBIDDEN, "Admin access required".to_string()))?;

    // Determine questions: from fromQuizId or from body
    let questions = if let Some(quiz_id) = body.from_quiz_id {
        safe_asset_id(&quiz_id).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
        let registry = state.registry.read().await;
        registry
            .quizzes
            .get(&quiz_id)
            .map(|q| {
                serde_json::to_value(&q.questions)
                    .unwrap_or(Value::Array(vec![]))
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
            })
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Quiz {} not found", quiz_id)))?
    } else {
        body.questions
    };

    // Generate ID from name
    let base_id = slugify_id(&body.name);
    if base_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Template name cannot be empty or contain only special characters".to_string(),
        ));
    }
    let id = next_template_id(&base_id);

    // Build template object
    let template = serde_json::json!({
        "id": id,
        "category": body.category,
        "name": body.name,
        "description": body.description,
        "tags": body.tags,
        "questions": questions,
    });

    // Atomic write: tmp + rename
    let dir = templates_dir();
    fs::create_dir_all(&dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create templates directory: {e}"),
        )
    })?;

    let tmp_path = dir.join(format!("{}.json.tmp", id));
    let final_path = dir.join(format!("{}.json", id));

    let json_str = serde_json::to_string_pretty(&template).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize template: {e}"),
        )
    })?;

    fs::write(&tmp_path, json_str).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write template: {e}"),
        )
    })?;

    fs::rename(&tmp_path, &final_path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to rename template file: {e}"),
        )
    })?;

    let full = TemplateFull {
        id: id.clone(),
        category: body.category,
        name: body.name,
        description: body.description,
        tags: body.tags,
        question_count: questions.len(),
        questions,
    };

    Ok((StatusCode::CREATED, Json(full)))
}

pub async fn handle_update_template(
    headers: HeaderMap,
    Path(id): Path<String>,
    State(_state): State<AppState>,
    Json(body): Json<TemplateWriteBody>,
) -> Result<Json<TemplateFull>, (StatusCode, String)> {
    // Admin-gate
    crate::auth::ensure_admin_user(&headers, &_state.db_pool)
        .await
        .ok_or_else(|| (StatusCode::FORBIDDEN, "Admin access required".to_string()))?;

    safe_asset_id(&id).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let path = templates_dir().join(format!("{}.json", id));

    // Check that the template exists
    if !path.exists() {
        return Err((StatusCode::NOT_FOUND, "Template not found".to_string()));
    }

    // Build updated template object
    let template = serde_json::json!({
        "id": id,
        "category": body.category,
        "name": body.name,
        "description": body.description,
        "tags": body.tags,
        "questions": body.questions,
    });

    // Atomic write: tmp + rename
    let tmp_path = path.with_file_name(format!("{}.json.tmp", id));

    let json_str = serde_json::to_string_pretty(&template).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize template: {e}"),
        )
    })?;

    fs::write(&tmp_path, json_str).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write template: {e}"),
        )
    })?;

    fs::rename(&tmp_path, &path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to rename template file: {e}"),
        )
    })?;

    let full = TemplateFull {
        id: id.clone(),
        category: body.category,
        name: body.name,
        description: body.description,
        tags: body.tags,
        question_count: body.questions.len(),
        questions: body.questions,
    };

    Ok(Json(full))
}

pub async fn handle_delete_template(
    headers: HeaderMap,
    Path(id): Path<String>,
    State(_state): State<AppState>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Admin-gate
    crate::auth::ensure_admin_user(&headers, &_state.db_pool)
        .await
        .ok_or_else(|| (StatusCode::FORBIDDEN, "Admin access required".to_string()))?;

    safe_asset_id(&id).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let path = templates_dir().join(format!("{}.json", id));

    fs::remove_file(&path).map_err(|e| {
        (
            StatusCode::NOT_FOUND,
            format!("Template not found or could not be deleted: {e}"),
        )
    })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct CreateFromTemplateBody {
    #[serde(rename = "templateId")]
    pub template_id: String,
    #[serde(default)]
    pub subject: Option<String>,
}

pub async fn handle_create_from_template(
    State(state): State<AppState>,
    Json(body): Json<CreateFromTemplateBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    safe_asset_id(&body.template_id).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let path = templates_dir().join(format!("{}.json", body.template_id));
    let tpl = load_template_file(&path)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Template not found".to_string()))?;
    let questions = tpl
        .get("questions")
        .cloned()
        .unwrap_or_else(|| Value::Array(vec![]));
    let name = tpl
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("Template");
    let subject = body.subject.unwrap_or_else(|| format!("(Vorlage: {name})"));
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let new_id = format!("tpl-{}-{:x}", body.template_id, millis);

    let quiz = Quizz {
        subject: subject.clone(),
        questions: serde_json::from_value(questions.clone()).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to build quiz from template: {e}"),
            )
        })?,
        archived: Some(false),
        theme_id: None,
    };
    let serialized = serde_json::to_string_pretty(&quiz).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serialize quiz: {e}"),
        )
    })?;
    let quiz_dir = PathBuf::from(get_config_path()).join("quizz");
    fs::create_dir_all(&quiz_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create quiz directory: {e}"),
        )
    })?;
    fs::write(quiz_dir.join(format!("{new_id}.json")), serialized).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write quiz: {e}"),
        )
    })?;

    state
        .registry
        .write()
        .await
        .quizzes
        .insert(new_id.clone(), quiz);

    Ok(Json(serde_json::json!({
        "id": new_id,
        "subject": subject,
        "questions": questions,
        "archived": false,
    })))
}

#[cfg(test)]
mod tests {
    use super::super::AppState;
    use super::{
        handle_create_template, handle_delete_template, handle_update_template, load_template_file,
        slugify_id, templates_dir, TemplateCreateBody, TemplateFull, TemplateMeta,
        TemplateWriteBody,
    };
    use crate::state::{safe_asset_id, GameRegistry};
    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode};
    use serde_json::json;
    use socketioxide::SocketIo;
    use std::fs;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    // ── Helper: create a HeaderMap with no authorization ─────────────────────
    fn empty_headers() -> HeaderMap {
        HeaderMap::new()
    }

    // ── Helper: create a minimal SocketIo instance ──────────────────────────
    fn make_socket_io() -> SocketIo {
        let (_layer, io) = SocketIo::builder().build_layer();
        io.ns("/", |_socket: socketioxide::extract::SocketRef| {});
        io
    }

    // ── Helper: create a minimal AppState with no DB pool ────────────────────
    async fn make_test_app_state() -> AppState {
        let empty_quiz = razzoozle_protocol::quizz::Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let registry = GameRegistry::new(&None, empty_quiz).await;

        AppState {
            registry: Arc::new(RwLock::new(registry)),
            db_pool: None, // No database = admin check will fail
            io: make_socket_io(),
        }
    }

    // ── Test: safe_asset_id rejects path-traversal ──────────────────────────
    #[test]
    fn test_path_traversal_dots_rejected() {
        let result = safe_asset_id("../evil");
        assert!(
            result.is_err(),
            "Path traversal '../evil' should be rejected"
        );

        let result = safe_asset_id("..%2Fevil");
        assert!(
            result.is_err(),
            "Encoded path traversal '..%2Fevil' should be rejected"
        );

        let result = safe_asset_id("../../etc/passwd");
        assert!(result.is_err(), "Deep path traversal should be rejected");
    }

    // ── Test: safe_asset_id rejects reserved keywords ────────────────────────
    #[test]
    fn test_reserved_keywords_rejected() {
        let result = safe_asset_id("__proto__");
        assert!(
            result.is_err(),
            "Reserved keyword '__proto__' should be rejected"
        );

        let result = safe_asset_id("constructor");
        assert!(
            result.is_err(),
            "Reserved keyword 'constructor' should be rejected"
        );

        let result = safe_asset_id("prototype");
        assert!(
            result.is_err(),
            "Reserved keyword 'prototype' should be rejected"
        );
    }

    // ── Test: safe_asset_id accepts valid IDs ──────────────────────────────
    #[test]
    fn test_valid_asset_ids_accepted() {
        let result = safe_asset_id("tpl-math-quad");
        assert!(
            result.is_ok(),
            "Valid ID 'tpl-math-quad' should be accepted"
        );

        let result = safe_asset_id("my_template_42");
        assert!(
            result.is_ok(),
            "Valid ID 'my_template_42' should be accepted"
        );

        let result = safe_asset_id("Quiz2024");
        assert!(result.is_ok(), "Valid ID 'Quiz2024' should be accepted");
    }

    // ── Test: slugify_id converts name to lowercase slug ──────────────────────
    #[test]
    fn test_slugify_id_lowercase() {
        let result = slugify_id("Math Quadratic");
        assert_eq!(
            result, "math-quadratic",
            "Should convert to lowercase with hyphens"
        );

        let result = slugify_id("UPPER CASE NAME");
        assert_eq!(result, "upper-case-name", "Should lowercase all caps");
    }

    // ── Test: slugify_id replaces non-alphanumeric with dash ─────────────────
    #[test]
    fn test_slugify_id_special_chars() {
        let result = slugify_id("Quiz@2024#Edition!");
        assert!(
            result.contains('-'),
            "Special chars should be replaced with dashes"
        );
        assert!(!result.contains('@'), "@ should be replaced");
        assert!(!result.contains('#'), "# should be replaced");
        assert!(!result.contains('!'), "! should be replaced");
    }

    // ── Test: slugify_id handles UTF-8 safely (no panics) ────────────────────
    #[test]
    fn test_slugify_id_utf8_safe() {
        let result = slugify_id("Café ☕ Quiz");
        assert!(!result.is_empty(), "Should handle UTF-8 without panicking");
        assert!(result.contains('-'), "UTF-8 symbols should become dashes");
    }

    // ── Test: slugify_id handles emoji without panic ─────────────────────────
    #[test]
    fn test_slugify_id_emoji_safe() {
        let result = slugify_id("Quiz 🎓 2024");
        assert!(!result.is_empty(), "Emoji should not cause panic");
    }

    // ── Test: slugify_id trims excessive length ────────────────────────────
    #[test]
    fn test_slugify_id_max_length() {
        let long_name = "a".repeat(100);
        let result = slugify_id(&long_name);
        assert!(
            result.len() <= 50,
            "Slugified ID should be trimmed to 50 chars max"
        );
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
    #[ignore = "requires tempfile crate"]
    fn test_atomic_write_tmp_cleanup() {
        // Test ignored due to tempfile dependency
    }

    // ── Test: empty name rejected ─────────────────────────────────────────────
    #[test]
    fn test_empty_template_name_rejected() {
        let result = slugify_id("@#$%");
        assert!(
            result.is_empty() || result.trim_matches('-').is_empty(),
            "Special-chars-only name should slugify to empty or dashes"
        );
    }

    // ── Test: handle_create_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_create_template_requires_admin() {
        let body = TemplateCreateBody {
            name: "Test Template".to_string(),
            category: "test".to_string(),
            description: String::new(),
            tags: vec![],
            questions: vec![],
            from_quiz_id: None,
        };

        let headers = empty_headers();
        let state = make_test_app_state().await;

        let err = handle_create_template(headers, State(state), axum::Json(body))
            .await
            .unwrap_err();

        assert_eq!(
            err.0,
            StatusCode::FORBIDDEN,
            "CREATE template without admin should return 403"
        );
    }

    // ── Test: handle_update_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_update_template_requires_admin() {
        let headers = empty_headers();
        let state = make_test_app_state().await;

        let template_id = "tpl-test".to_string();
        let body = TemplateWriteBody {
            name: "Updated Template".to_string(),
            category: "test".to_string(),
            description: String::new(),
            tags: vec![],
            questions: vec![],
        };

        let err = handle_update_template(
            headers,
            axum::extract::Path(template_id),
            State(state),
            axum::Json(body),
        )
        .await
        .unwrap_err();

        assert_eq!(
            err.0,
            StatusCode::FORBIDDEN,
            "UPDATE template without admin should return 403"
        );
    }

    // ── Test: handle_delete_template forbids non-admin (403) ─────────────────
    #[tokio::test]
    async fn test_delete_template_requires_admin() {
        let headers = empty_headers();
        let state = make_test_app_state().await;

        let template_id = "tpl-test".to_string();

        let err = handle_delete_template(headers, axum::extract::Path(template_id), State(state))
            .await
            .unwrap_err();

        assert_eq!(
            err.0,
            StatusCode::FORBIDDEN,
            "DELETE template without admin should return 403"
        );
    }
}
