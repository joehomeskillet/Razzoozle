//! Quiz template library — file-backed under config/templates/*.json

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::state::safe_asset_id;
use super::AppState;

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

#[derive(Debug, Deserialize)]
pub struct CreateFromTemplateBody {
    #[serde(rename = "templateId")]
    pub template_id: String,
    #[serde(default)]
    pub subject: Option<String>,
}

pub async fn handle_create_from_template(
    State(_state): State<AppState>,
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
    Ok(Json(serde_json::json!({
        "id": new_id,
        "subject": subject,
        "questions": questions,
        "archived": false,
    })))
}
