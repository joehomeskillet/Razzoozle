//! Centralized manager/admin session-token authorization (w2-6/w2-7).
//!
//! Consolidates the `X-Manager-Token` → DB session-user resolution that used
//! to be duplicated across `http/mod.rs`, `http/assignments.rs`, and
//! `http/skeleton/mod.rs`. Role-specific policies (assignments: admin or
//! lehrkraft only; skeleton/admin routes: admin-only) still get decided at
//! their call sites, but now share this one lookup instead of each
//! re-implementing header parsing + `session_user` calls.

use axum::http::HeaderMap;

use crate::db::users::AuthUser;

fn manager_token(headers: &HeaderMap) -> &str {
    headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

/// Resolve `X-Manager-Token` to its DB session user, if any.
async fn resolve_session_user(
    headers: &HeaderMap,
    db_pool: &Option<sqlx::PgPool>,
) -> Option<AuthUser> {
    let token = manager_token(headers);
    if token.is_empty() {
        return None;
    }
    let pool = db_pool.as_ref()?;
    crate::db::users::session_user(pool, token).await.ok().flatten()
}

/// Base manager check: any authenticated session user, no role restriction.
/// Ported verbatim from the former `http::authorize_manager_request`
/// (http/mod.rs:98) — that function had zero live callers in the codebase.
pub async fn ensure_manager(headers: &HeaderMap, db_pool: &Option<sqlx::PgPool>) -> bool {
    resolve_session_user(headers, db_pool).await.is_some()
}

/// Admin-only check. Ported verbatim from the former
/// `http::authorize_admin_request` (http/mod.rs:124), which was already
/// functionally identical to the former `http::skeleton::authorize_manager`
/// (same DB lookup, same `role == "admin"` gate, just a different
/// handler-return convention).
pub async fn ensure_admin(headers: &HeaderMap, db_pool: &Option<sqlx::PgPool>) -> bool {
    resolve_session_user(headers, db_pool)
        .await
        .map(|u| u.role == "admin")
        .unwrap_or(false)
}

/// Resolves the session user itself for role checks that need more than a
/// bool — e.g. assignments' SEC-X2a admin-or-lehrkraft gate, which also logs
/// the denied role.
pub async fn ensure_manager_user(
    headers: &HeaderMap,
    db_pool: &Option<sqlx::PgPool>,
) -> Option<AuthUser> {
    resolve_session_user(headers, db_pool).await
}
