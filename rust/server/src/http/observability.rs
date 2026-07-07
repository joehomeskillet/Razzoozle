use axum::Json;
use axum::http::StatusCode;
use serde_json::json;

use super::{is_dev_mode, json_error_response};

#[derive(Debug, serde::Serialize)]
pub struct EventsResponse {
    pub events: serde_json::Value,
}

#[derive(Debug, serde::Serialize)]
pub struct SchemaResponse {
    #[serde(flatten)]
    pub schema: serde_json::Value,
}

pub async fn handle_observability_events() -> Result<Json<EventsResponse>, (StatusCode, Json<serde_json::Value>)> {
    if !is_dev_mode() {
        return Err(json_error_response(StatusCode::NOT_FOUND, "not found"));
    }

    // parity: Node serves buildEventCatalog(); port pending — dev-gated route returns honest empty list until then.
    let events = json!([]);
    Ok(Json(EventsResponse { events }))
}

pub async fn handle_observability_schema() -> Result<Json<SchemaResponse>, (StatusCode, Json<serde_json::Value>)> {
    if !is_dev_mode() {
        return Err(json_error_response(StatusCode::NOT_FOUND, "not found"));
    }

    let schema = json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "clientId": { "type": "string" },
            "type": { "type": "string" }
        },
        "required": ["clientId", "type"]
    });
    Ok(Json(SchemaResponse { schema }))
}
