//! Baseline security response headers, applied as a single router-wide layer
//! (see `router()` in `http/mod.rs`) instead of per-handler. That is the point:
//! a layer also covers responses nobody writes header code for — 404s, the SPA
//! fallback, future routes — where a per-handler approach would silently miss them.
//!
//! Only headers that cannot make the app misbehave in a browser are set here.
//! A Content-Security-Policy is deliberately NOT included yet — see the comment
//! on `apply_security_headers` below.
use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;

/// Adds `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` to
/// every response that passes through the router (registered via
/// `axum::middleware::from_fn` after `.fallback()` so it also wraps the SPA
/// fallback route -- see the layer-ordering note in `router()`).
pub async fn apply_security_headers(req: Request, next: Next) -> Response {
    let mut resp = next.run(req).await;
    let headers = resp.headers_mut();

    // Stops browsers from MIME-sniffing a response into a different content
    // type (e.g. treating an uploaded image as HTML/JS) -- no behavioural
    // risk, every response already declares an accurate Content-Type.
    headers.insert(
        axum::http::header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );

    // SAMEORIGIN (not DENY): blocks cross-origin clickjacking framing, the
    // actual threat, while still allowing same-origin framing the app itself
    // might rely on. Nothing here loads cross-origin, so no page ever needs
    // to be embedded from another site.
    headers.insert(
        axum::http::header::X_FRAME_OPTIONS,
        HeaderValue::from_static("SAMEORIGIN"),
    );

    // Sends only the origin (not the full URL/query) on cross-origin
    // requests, same-origin requests keep the full referrer. Prevents PIN
    // codes or tokens that end up in the URL from leaking to third parties
    // via the Referer header.
    headers.insert(
        axum::http::header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    resp
}
