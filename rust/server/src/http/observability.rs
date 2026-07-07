use axum::Json;
use serde_json::json;

#[derive(Debug, serde::Serialize)]
pub struct EventsResponse {
    pub events: serde_json::Value,
}

#[derive(Debug, serde::Serialize)]
pub struct SchemaResponse {
    #[serde(flatten)]
    pub schema: serde_json::Value,
}

/// GET /api/v1/observability/events — return static event catalog.
/// Dev-gated (dev mode only; no key required).
pub async fn handle_observability_events() -> Json<EventsResponse> {
    // DEFER: buildEventCatalog() needs to be ported from Node's @razzoozle/common/openapi/events-catalog.
    // For now, return a minimal stub. This should be a static const built from the common types.
    let events = json!([
        {
            "name": "QUIZ_LOAD",
            "direction": "server->client",
            "role": "player"
        }
    ]);
    Json(EventsResponse { events })
}

/// GET /api/v1/observability/schema — return JSON Schema for client-events.
/// Dev-gated (dev mode only; no key required).
pub async fn handle_observability_schema() -> Json<SchemaResponse> {
    // DEFER: z.toJSONSchema(clientEventValidator, { target: "draft-2020-12", unrepresentable: "any" })
    // For now, return a minimal JSON Schema. This should be generated from the Zod schema in common.
    let schema = json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "clientId": { "type": "string" },
            "type": { "type": "string" }
        },
        "required": ["clientId", "type"]
    });
    Json(SchemaResponse { schema })
}
