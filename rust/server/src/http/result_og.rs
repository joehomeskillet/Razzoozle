use axum::{
    extract::Path,
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};
use std::path::Path as StdPath;

use super::AppState;
use crate::db::get_result_by_id;

// Path to index.html in prod Docker image (Dockerfile: COPY web/dist -> /app/web)
const OG_INDEX_HTML_PROD: &str = "/app/web/index.html";
// Fallback paths for development
const OG_INDEX_HTML_DEV: &[&str] = &[
    "packages/web/dist/index.html",
    "packages/web/index.html",
    "web/dist/index.html",
];

/// HTML-escape for safe injection into HTML attributes
fn esc_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Inject OG meta tags and title into HTML
/// Uses simple string replacement (same as Node's approach)
fn inject_og(html: &str, title: &str, desc: &str) -> String {
    let title_esc = esc_html(title);
    let desc_esc = esc_html(desc);

    let mut result = html.to_string();

    // Replace og:title content attribute
    if let Ok(re) = regex::Regex::new(r#"(<meta property="og:title" content=")[^"]*(")"#) {
        result = re.replace(&result, format!(r#"$1{}$2"#, title_esc)).to_string();
    }

    // Replace og:description content attribute
    if let Ok(re) = regex::Regex::new(r#"(<meta property="og:description" content=")[^"]*(")"#) {
        result = re.replace(&result, format!(r#"$1{}$2"#, desc_esc)).to_string();
    }

    // Replace title element
    if let Ok(re) = regex::Regex::new(r"(<title>)[^<]*(<\/title>)") {
        result = re.replace(&result, format!(r"$1{}$2", title_esc)).to_string();
    }

    result
}

/// Read index.html from prod/dev paths
fn read_index_html() -> Result<String, Box<dyn std::error::Error>> {
    // Try prod path first
    if StdPath::new(OG_INDEX_HTML_PROD).exists() {
        return Ok(std::fs::read_to_string(OG_INDEX_HTML_PROD)?);
    }

    // Try dev paths
    for dev_path in OG_INDEX_HTML_DEV {
        if StdPath::new(dev_path).exists() {
            return Ok(std::fs::read_to_string(dev_path)?);
        }
    }

    Err("index.html not found in any expected location".into())
}

/// GET /r/:id — Open Graph unfurl for social media share previews
pub async fn handle_result_og(
    Path(id): Path<String>,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<impl IntoResponse, Response> {
    // Read base HTML (302 redirect if SPA shell missing)
    let mut html = match read_index_html() {
        Ok(h) => h,
        Err(_) => {
            return Err((
                StatusCode::FOUND,
                [("Location", "/")],
            ).into_response());
        }
    };

    // Try to load result and inject OG tags
    if let Some(result) = get_result_by_id(&state.db_pool, &id).await {
        if let Some(players) = result.get("players").and_then(|p| p.as_array()) {
            if let Some(first_player) = players.first() {
                let winner_name = first_player
                    .get("username")
                    .and_then(|u| u.as_str())
                    .unwrap_or("Ein Spieler");
                let points = first_player
                    .get("points")
                    .and_then(|p| p.as_i64())
                    .unwrap_or(0);
                let subject = result
                    .get("subject")
                    .and_then(|s| s.as_str())
                    .unwrap_or("Razzoozle");

                let title = format!("{} — {} gewinnt!", subject, winner_name);
                let desc = format!(
                    "{} gewinnt mit {} Punkten. Spiel selbst auf Razzoozle.",
                    winner_name, points
                );

                html = inject_og(&html, &title, &desc);
            }
        }
    }

    Ok((
        StatusCode::OK,
        [("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "no-cache")],
        Html(html),
    ))
}
