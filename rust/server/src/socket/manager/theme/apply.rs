use super::super::super::HandlerCtx;
use super::super::config_helper;
use super::validate_theme;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use chrono::Utc;

/// Load current theme from disk for revision snapshot
pub(super) fn load_current_theme() -> Option<serde_json::Value> {
    let theme_path = Path::new("config/theme/theme.json");
    if theme_path.exists() {
        if let Ok(content) = fs::read_to_string(theme_path) {
            if let Ok(theme) = serde_json::from_str(&content) {
                return Some(theme);
            }
        }
    }
    None
}

/// Save theme revision snapshot before overwriting (to database).
async fn save_theme_revision(current_theme: serde_json::Value, ctx: &HandlerCtx) -> Result<(), String> {
    // Create new revision with timestamp-based ID
    let timestamp_ms = Utc::now().timestamp_millis();
    let id = format!("rev-{}", timestamp_ms);
    let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let revision = serde_json::json!({
        "id": id,
        "createdAt": created_at,
        "theme": current_theme
    });

    // Persist to database
    db::insert_theme_revision(&ctx.db_pool, &revision, &created_at).await
}

/// SET_THEME must not own the skeleton enable-flags: `customCssEnabled` /
/// `customJsEnabled` belong exclusively to set_skeleton_asset / reset_skeleton,
/// which flip the flag and write/delete the file together. A theme save carrying
/// a stale flag (from a client store that hasn't seen a reset) would otherwise
/// desync the flag from disk — and a true flag with no file makes every client
/// inject /theme/skeleton.{css,js} and 404 (#235). Clamp both flags to actual
/// file presence so the flag ⟺ file invariant holds on every persist/broadcast.
fn clamp_skeleton_flags(theme: &mut serde_json::Value, skeleton_dir: &Path) {
    if let Some(obj) = theme.as_object_mut() {
        obj.insert(
            "customCssEnabled".to_string(),
            serde_json::json!(skeleton_dir.join("skeleton.css").exists()),
        );
        obj.insert(
            "customJsEnabled".to_string(),
            serde_json::json!(skeleton_dir.join("skeleton.js").exists()),
        );
    }
}

/// Apply theme: validate, save revision (if existing theme), persist to disk, and mirror to DB.
/// Returns the persisted theme on success, or an error message on failure.
pub async fn apply_theme(payload: &serde_json::Value, ctx: &HandlerCtx) -> Result<serde_json::Value, String> {
    // Validate theme payload structure and field types
    if let Err(error) = validate_theme(&payload) {
        return Err(error);
    }

    // Clamp the skeleton enable-flags to on-disk file presence (see above): the
    // clamped copy is what we persist, broadcast, and return.
    let mut theme = payload.clone();
    clamp_skeleton_flags(&mut theme, Path::new("config/theme"));

    // Capture current theme and save as revision BEFORE overwriting
    if let Some(current_theme) = load_current_theme() {
        if let Err(e) = save_theme_revision(current_theme, ctx).await {
            return Err(format!("Revision save failed: {}", e));
        }
    }

    // Persist to disk — MANAGER.GET_THEME reads this exact file, so
    // writing it keeps the read/write round-trip consistent (a reload or a
    // fresh GET_THEME must see the theme this handler just saved).
    let theme_dir = std::path::Path::new("config/theme");

    if !theme_dir.exists() {
        if let Err(e) = fs::create_dir_all(theme_dir) {
            return Err(format!("Failed to save theme: {}", e));
        }
    }

    let theme_json = match serde_json::to_string_pretty(&theme) {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("Failed to save theme: {}", e));
        }
    };

    if let Err(e) = fs::write(theme_dir.join("theme.json"), theme_json) {
        return Err(format!("Failed to save theme: {}", e));
    }

    // Mirror to DB (additive; keeps the themes table in sync for future
    // DB-only reads). The file write above is the source of truth for
    // GET_THEME, so a DB hiccup (or no pool configured) must not fail the
    // save — just log it and continue.
    if let Err(e) = db::upsert_theme(&ctx.db_pool, &theme).await {
        eprintln!("apply_theme — DB mirror failed (non-fatal): {}", e);
    }

    Ok(theme)
}

pub(super) fn register_set_theme(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_THEME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, "")
                            .ok();
                        return;
                    }
                };

                match apply_theme(&payload, &ctx).await {
                    Ok(theme) => {
                        socket
                            .emit(constants::manager::SET_THEME_SUCCESS, &theme)
                            .ok();

                        socket.broadcast()
                            .emit(constants::manager::THEME, &theme)
                            .ok();

                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(error) => {
                        socket
                            .emit(constants::manager::THEME_ERROR, &error)
                            .ok();
                    }
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::clamp_skeleton_flags;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;

    // Unique scratch dir under the OS temp dir (no tempfile dep in the tree).
    fn scratch(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "razzoozle_clamp_{}_{}_{}",
            tag,
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn flag(v: &serde_json::Value, key: &str) -> Option<bool> {
        v.get(key).and_then(|f| f.as_bool())
    }

    #[test]
    fn true_flags_clamped_to_false_when_files_absent() {
        let dir = scratch("absent");
        let mut theme = json!({ "customCssEnabled": true, "customJsEnabled": true });
        clamp_skeleton_flags(&mut theme, &dir);
        assert_eq!(flag(&theme, "customCssEnabled"), Some(false));
        assert_eq!(flag(&theme, "customJsEnabled"), Some(false));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn true_flags_stay_true_when_files_present() {
        let dir = scratch("present");
        fs::write(dir.join("skeleton.css"), b":root{}").unwrap();
        fs::write(dir.join("skeleton.js"), b"// noop").unwrap();
        let mut theme = json!({ "customCssEnabled": true, "customJsEnabled": true });
        clamp_skeleton_flags(&mut theme, &dir);
        assert_eq!(flag(&theme, "customCssEnabled"), Some(true));
        assert_eq!(flag(&theme, "customJsEnabled"), Some(true));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_track_files_independently() {
        // Mirrors the live orphan (#235): css file present, js file absent —
        // a sent customJsEnabled=true must not survive without skeleton.js.
        let dir = scratch("mixed");
        fs::write(dir.join("skeleton.css"), b":root{}").unwrap();
        let mut theme = json!({ "customCssEnabled": false, "customJsEnabled": true });
        clamp_skeleton_flags(&mut theme, &dir);
        assert_eq!(flag(&theme, "customCssEnabled"), Some(true));
        assert_eq!(flag(&theme, "customJsEnabled"), Some(false));
        fs::remove_dir_all(&dir).ok();
    }
}
