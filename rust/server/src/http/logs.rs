use axum::{
    http::{StatusCode, HeaderMap, header},
    response::{IntoResponse, Response},
};
use lazy_static::lazy_static;
use std::collections::VecDeque;
use std::sync::Mutex;

use super::{is_dev_mode, dev_api_key};

const SERVER_LOGS_MAX: usize = 1000;
const CLIENT_LOGS_MAX: usize = 1000;

lazy_static! {
    static ref SERVER_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
    static ref CLIENT_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
}

pub fn push_server_log(entry: String) {
    if let Ok(mut logs) = SERVER_LOGS.lock() {
        if logs.len() >= SERVER_LOGS_MAX {
            logs.pop_front();
        }
        logs.push_back(entry);
    }
}

pub fn get_server_logs() -> Vec<String> {
    SERVER_LOGS.lock()
        .ok()
        .map(|logs| logs.iter().cloned().collect())
        .unwrap_or_default()
}

pub fn push_client_log(entry: String) {
    if let Ok(mut logs) = CLIENT_LOGS.lock() {
        if logs.len() >= CLIENT_LOGS_MAX {
            logs.pop_front();
        }
        logs.push_back(entry);
    }
}

pub fn get_client_logs() -> Vec<String> {
    CLIENT_LOGS.lock()
        .ok()
        .map(|logs| logs.iter().cloned().collect())
        .unwrap_or_default()
}

/// Constant-time string comparison (defense against timing attacks)
fn constant_time_equals(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();

    if a_bytes.len() != b_bytes.len() {
        return false;
    }

    let mut equal = true;
    for (x, y) in a_bytes.iter().zip(b_bytes.iter()) {
        equal &= x == y;
    }

    equal
}

/// Authorize a dev-gated request (RAZZOOLE_DEV=1 + DEV_API_KEY token)
fn authorize_dev_request(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    if !is_dev_mode() {
        return Err((StatusCode::NOT_FOUND, "not found".to_string()));
    }

    let header_token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if header_token.is_empty() {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    if let Some(dev_key) = dev_api_key() {
        if constant_time_equals(header_token, &dev_key) {
            return Ok(());
        }
    }

    Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()))
}

pub async fn handle_logs_server(
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    authorize_dev_request(&headers)?;

    let logs = get_server_logs();
    let body = logs.join("\n");

    let mut response_headers = axum::http::HeaderMap::new();
    response_headers.insert(
        header::CONTENT_TYPE,
        "text/plain; charset=utf-8".parse().unwrap(),
    );
    response_headers.insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"server-logs.ndjson\"".parse().unwrap(),
    );

    Ok((response_headers, body).into_response())
}

pub async fn handle_logs_client(
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    authorize_dev_request(&headers)?;

    let logs = get_client_logs();
    let body = logs.join("\n");

    let mut response_headers = axum::http::HeaderMap::new();
    response_headers.insert(
        header::CONTENT_TYPE,
        "text/plain; charset=utf-8".parse().unwrap(),
    );
    response_headers.insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"client-logs.ndjson\"".parse().unwrap(),
    );

    Ok((response_headers, body).into_response())
}
