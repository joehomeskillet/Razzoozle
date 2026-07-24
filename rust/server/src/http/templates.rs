//! Quiz template library — file-backed under config/templates/*.json

use axum::{extract::{Path, State}, http::{HeaderMap, StatusCode}, Json};
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::state::safe_asset_id;
use super::{get_config_path, AppState};

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
    for c in [PathBuf::from("config/templates"), PathBuf::from("../config/templates")] {
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
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
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
                    id: v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
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

    let questions = v.get("questions")
        .and_then(|q| q.as_array())
        .cloned()
        .unwrap_or_default();

    let full = TemplateFull {
        id: v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        category: v.get("category").and_then(|x| x.as_str()).unwrap_or("custom").to_string(),
        name: v.get("name").and_then(|x| x.as_str()).unwrap_or("Template").to_string(),
        description: v.get("description").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        tags: v.get("tags")
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
        registry.quizzes.get(&quiz_id)
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
        return Err((StatusCode::BAD_REQUEST, "Template name cannot be empty or contain only special characters".to_string()));
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
    fs::create_dir_all(&dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create templates directory: {e}")))?;

    let tmp_path = dir.join(format!("{}.json.tmp", id));
    let final_path = dir.join(format!("{}.json", id));

    let json_str = serde_json::to_string_pretty(&template)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize template: {e}")))?;

    fs::write(&tmp_path, json_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write template: {e}")))?;

    fs::rename(&tmp_path, &final_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to rename template file: {e}")))?;

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

    let json_str = serde_json::to_string_pretty(&template)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize template: {e}")))?;

    fs::write(&tmp_path, json_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write template: {e}")))?;

    fs::rename(&tmp_path, &path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to rename template file: {e}")))?;

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

    fs::remove_file(&path)
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Template not found or could not be deleted: {e}")))?;

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
    let subject = body
        .subject
        .unwrap_or_else(|| format!("(Vorlage: {name})"));
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
