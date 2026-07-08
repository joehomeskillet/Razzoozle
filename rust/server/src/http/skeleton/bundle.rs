//! Skeleton ZIP build + import (Node theme-skeleton.ts buildSkeletonZip +
//! importSkeletonZip). Caps are the VERIFIED Node constants (theme-skeleton.ts:
//! 22-36): ENTRY 200, TOTAL 32 MB, per-asset 512 KB (per-asset applies ONLY to
//! theme.css/theme.js, like Node — media is bounded only by the 32 MB total).
//! SKELETON_ASSET_EXT INCLUDES "svg" (trusted manager surface, unlike the
//! public PLUGIN_ASSET_EXT). Zip-slip hardening mirrors plugins_zip.rs (leading
//! /-\, "..", NUL, symlink skip, dest-containment) — no unwrap/expect on ZIP
//! bytes: every fallible step -> Err.

use serde_json::{json, Value};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use crate::socket::manager::public::get_default_theme;
use crate::socket::manager::theme::validate_theme;

const SKELETON_FORMAT_VERSION: u64 = 1;
const SKELETON_ASSET_MAX_BYTES: usize = 512 * 1024;
const SKELETON_TOTAL_MAX_BYTES: usize = 32 * 1024 * 1024;
const SKELETON_ENTRY_MAX: usize = 200;
const THEME_REVISIONS_MAX: usize = 10;

/// theme-skeleton.ts:26-36 — INCLUDES svg (trusted manager surface).
const SKELETON_ASSET_EXT: [&str; 9] =
    ["svg", "webp", "png", "jpg", "jpeg", "woff2", "mp3", "wav", "ogg"];
const SKELETON_BACKGROUND_SLOTS: [&str; 3] = ["auth", "managerGame", "playerGame"];
/// common/constants.ts:410-425 SOUND_SLOTS.
const SOUND_SLOTS: [&str; 13] = [
    "answersMusic", "answersSound", "podiumThree", "podiumSecond", "podiumFirst",
    "podiumSnearRoll", "results", "show", "boump", "tierBronze", "tierSilver",
    "tierGold", "tierDiamant",
];

/// The socket theme subsystem (apply.rs/uploads.rs/public.rs) reads+writes
/// config/ RELATIVE to CWD and GET_THEME serves config/theme/theme.json, so the
/// import MUST write that same base for the theme to take effect (not
/// get_config_path(), which is CONFIG_PATH-based).
fn config_base() -> PathBuf {
    PathBuf::from("config")
}

fn basename(p: &str) -> &str {
    p.rsplit('/').next().unwrap_or(p)
}

/// Node path.extname(base).slice(1).toLowerCase(): "" for dotfiles / no-dot.
fn ext_lower(base: &str) -> String {
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => base[i + 1..].to_lowercase(),
    }
}

/// Node: entry.name.replace(/^assets\/(backgrounds\/|sounds\/)?/, "") — strips
/// exactly one optional sub-level so only files DIRECTLY under assets/,
/// assets/backgrounds/ or assets/sounds/ round-trip (deeper nesting is skipped
/// via the base == expected check).
fn strip_assets_prefix(name: &str) -> &str {
    name.strip_prefix("assets/backgrounds/")
        .or_else(|| name.strip_prefix("assets/sounds/"))
        .or_else(|| name.strip_prefix("assets/"))
        .unwrap_or(name)
}

// ── Export ─────────────────────────────────────────────────────────────────

fn load_current_theme(base: &Path) -> Value {
    fs::read_to_string(base.join("theme/theme.json"))
        .ok()
        .and_then(|c| serde_json::from_str::<Value>(&c).ok())
        .unwrap_or_else(get_default_theme)
}

fn add_asset(
    zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>,
    opts: zip::write::SimpleFileOptions,
    base: &Path,
    value: Option<&Value>,
    entry_dir: &str,
) -> Result<(), String> {
    // Node addAsset: no-op on null/empty and on refs that are not /media/ or
    // /theme/ served assets (skeletonSourcePath returns null), and on missing
    // files (!fs.existsSync).
    let value = match value.and_then(|v| v.as_str()) {
        Some(v) if !v.is_empty() => v,
        _ => return Ok(()),
    };
    if !value.starts_with("/media/") && !value.starts_with("/theme/") {
        return Ok(());
    }
    let src = base.join(&value[1..]);
    let content = match fs::read(&src) {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };
    zip.start_file(format!("{}/{}", entry_dir, basename(value)), opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(&content).map_err(|e| e.to_string())?;
    Ok(())
}

/// buildSkeletonZip parity: skeleton.json (theme) + served assets + the saved
/// custom theme.css/theme.js. DEFERRED (parity gap, documented): Node also
/// ships GENERATED fallback scaffolds (renderSkeletonCss/Js) + SKELETON.md +
/// demo/*.html previews (~1360 lines of TS templates) — pure presentation, no
/// security/data weight. The bundle still carries the real theme + real assets
/// + real custom CSS/JS (never a 501 stub). Blank custom files are NOT shipped,
/// so a re-import never enables customCss/Js from an empty scaffold.
pub(super) fn build_skeleton_zip() -> Result<Vec<u8>, String> {
    let base = config_base();
    let theme = load_current_theme(&base);
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();

    let name = theme
        .get("appTitle")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("razzoozle");
    let manifest = json!({
        "formatVersion": SKELETON_FORMAT_VERSION,
        "name": name,
        "theme": theme,
    });
    zip.start_file("skeleton.json", opts).map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    add_asset(&mut zip, opts, &base, theme.get("logo"), "assets")?;
    if let Some(bg) = theme.get("backgrounds") {
        for slot in SKELETON_BACKGROUND_SLOTS {
            add_asset(&mut zip, opts, &base, bg.get(slot), "assets/backgrounds")?;
        }
    }
    if let Some(sounds) = theme.get("sounds") {
        for slot in SOUND_SLOTS {
            add_asset(&mut zip, opts, &base, sounds.get(slot), "assets/sounds")?;
        }
    }

    // Ship the saved custom overrides when present (else omit — the generated
    // scaffold is the deferred renderer's job).
    for (file, entry) in [("theme/skeleton.css", "theme.css"), ("theme/skeleton.js", "theme.js")] {
        if let Ok(content) = fs::read(base.join(file)) {
            zip.start_file(entry, opts).map_err(|e| e.to_string())?;
            zip.write_all(&content).map_err(|e| e.to_string())?;
        }
    }

    Ok(zip.finish().map_err(|e| e.to_string())?.into_inner())
}

// ── Import ─────────────────────────────────────────────────────────────────

/// importSkeletonZip parity + plugins-style zip-slip hardening. Returns the
/// persisted theme (mutated refs + skeletonVersion). All errors -> 400 (Node:
/// throw -> statusFrom413 -> 400). Error keys are EXACT Node strings.
pub(super) fn import_skeleton_zip(bytes: &[u8]) -> Result<Value, String> {
    let base = config_base();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "errors:skeleton.invalidZip".to_string())?;

    if archive.len() > SKELETON_ENTRY_MAX {
        return Err("errors:skeleton.tooManyEntries".to_string());
    }

    // Pass 1: decompress file entries, total-cap. Per-entry read is capped at
    // TOTAL+1 so a single zip-bomb entry can't balloon memory unbounded.
    let mut entries: Vec<(String, Vec<u8>, bool)> = Vec::new();
    let mut total = 0usize;
    for i in 0..archive.len() {
        let mut f = archive
            .by_index(i)
            .map_err(|_| "errors:skeleton.invalidZip".to_string())?;
        if f.is_dir() {
            continue;
        }
        let is_symlink = f.unix_mode().map(|m| m & 0o170000 == 0o120000).unwrap_or(false);
        let mut buf = Vec::new();
        (&mut f)
            .take(SKELETON_TOTAL_MAX_BYTES as u64 + 1)
            .read_to_end(&mut buf)
            .map_err(|_| "errors:skeleton.invalidZip".to_string())?;
        total += buf.len();
        if total > SKELETON_TOTAL_MAX_BYTES {
            return Err("errors:skeleton.tooLarge".to_string());
        }
        entries.push((f.name().to_string(), buf, is_symlink));
    }

    let manifest = entries
        .iter()
        .find(|(n, _, _)| n == "skeleton.json")
        .map(|(_, b, _)| b.as_slice())
        .ok_or_else(|| "errors:skeleton.missingManifest".to_string())?;
    let parsed: Value = serde_json::from_slice(manifest).map_err(|e| e.to_string())?;
    let mut theme = parsed.get("theme").cloned().unwrap_or(Value::Null);
    // themeValidator.parse parity (the Rust twin's themeValidator IS validate_theme).
    validate_theme(&theme)?;

    // Pass 2: write allowlisted, traversal-safe assets and rewrite theme refs.
    for (name, content, is_symlink) in &entries {
        if *is_symlink || !name.starts_with("assets/") || name.contains('\0') {
            continue;
        }
        let base_name = basename(name);
        // Node: base must equal the name with one assets/ sub-level stripped
        // (rejects deeper nesting) + explicit slip guards.
        if base_name != strip_assets_prefix(name)
            || base_name.is_empty()
            || base_name.contains('/')
            || base_name.contains('\\')
            || base_name.contains("..")
        {
            continue;
        }
        if !SKELETON_ASSET_EXT.contains(&ext_lower(base_name).as_str()) {
            continue;
        }

        let is_bg = name.starts_with("assets/backgrounds/");
        let is_sound = name.starts_with("assets/sounds/");
        let dest = if is_bg {
            base.join("media/backgrounds").join(base_name)
        } else if is_sound {
            base.join("media/sounds").join(base_name)
        } else {
            base.join("theme").join(base_name)
        };
        // plugins-style dest containment (defence-in-depth).
        if !dest.starts_with(&base) {
            continue;
        }
        if let Some(p) = dest.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        fs::write(&dest, content).map_err(|e| e.to_string())?;

        // Rewrite theme refs whose basename matches the written asset.
        if !is_bg && !is_sound {
            rewrite_ref(&mut theme, &["logo"], base_name, &format!("/theme/{}", base_name));
        }
        if is_bg {
            for slot in SKELETON_BACKGROUND_SLOTS {
                rewrite_ref(&mut theme, &["backgrounds", slot], base_name,
                    &format!("/media/backgrounds/{}", base_name));
            }
        }
        if is_sound {
            for slot in SOUND_SLOTS {
                rewrite_ref(&mut theme, &["sounds", slot], base_name,
                    &format!("/media/sounds/{}", base_name));
            }
        }
    }

    // theme.css / theme.js — the ONLY entries subject to the 512 KB per-asset cap.
    for (entry_name, out_file, flag) in [
        ("theme.css", "theme/skeleton.css", "customCssEnabled"),
        ("theme.js", "theme/skeleton.js", "customJsEnabled"),
    ] {
        if let Some((_, content, _)) = entries.iter().find(|(n, _, _)| n == entry_name) {
            if content.len() > SKELETON_ASSET_MAX_BYTES {
                return Err("errors:skeleton.assetTooLarge".to_string());
            }
            fs::create_dir_all(base.join("theme")).map_err(|e| e.to_string())?;
            fs::write(base.join(out_file), content).map_err(|e| e.to_string())?;
            if let Some(o) = theme.as_object_mut() {
                o.insert(flag.to_string(), json!(true));
            }
        }
    }

    let next_ver = theme.get("skeletonVersion").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
    if let Some(o) = theme.as_object_mut() {
        o.insert("skeletonVersion".to_string(), json!(next_ver));
    }

    persist_theme(&base, &theme)?;
    Ok(theme)
}

/// If theme[path] is a string whose basename == `base_name`, replace it with
/// `new`. Handles the root (["logo"]) and one-level-nested (["backgrounds",
/// slot] / ["sounds", slot]) refs — the only shapes the import uses.
fn rewrite_ref(theme: &mut Value, path: &[&str], base_name: &str, new: &str) {
    let (last, parent) = match path {
        [key] => (*key, theme),
        [group, key] => match theme.get_mut(*group) {
            Some(p) => (*key, p),
            None => return,
        },
        _ => return,
    };
    let matches = parent
        .get(last)
        .and_then(|v| v.as_str())
        .map(|s| basename(s) == base_name)
        .unwrap_or(false);
    if matches {
        if let Some(o) = parent.as_object_mut() {
            o.insert(last.to_string(), json!(new));
        }
    }
}

/// setTheme() parity (config/theme/core.ts): snapshot the current on-disk theme
/// to the revision ring, then overwrite theme.json. (DB mirror runs on the
/// async side.) Snapshot is skipped when no theme.json exists yet, matching the
/// Rust twin's apply.rs.
fn persist_theme(base: &Path, theme: &Value) -> Result<(), String> {
    let theme_dir = base.join("theme");
    fs::create_dir_all(&theme_dir).map_err(|e| e.to_string())?;
    let theme_json = theme_dir.join("theme.json");
    if let Ok(cur) = fs::read_to_string(&theme_json) {
        if let Ok(cur_val) = serde_json::from_str::<Value>(&cur) {
            save_theme_revision(base, cur_val)?;
        }
    }
    let out = serde_json::to_string_pretty(theme).map_err(|e| e.to_string())?;
    fs::write(&theme_json, out).map_err(|e| e.to_string())?;
    Ok(())
}

fn save_theme_revision(base: &Path, current: Value) -> Result<(), String> {
    let path = base.join("theme-revisions.json");
    let mut revisions: Vec<Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();
    let ts = chrono::Utc::now().timestamp_millis();
    revisions.insert(0, json!({
        "id": format!("rev-{}", ts),
        "createdAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "theme": current,
    }));
    if revisions.len() > THEME_REVISIONS_MAX {
        revisions.truncate(THEME_REVISIONS_MAX);
    }
    let s = serde_json::to_string_pretty(&revisions).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_zip(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let o = zip::write::SimpleFileOptions::default();
        for (n, c) in files {
            w.start_file(*n, o).unwrap();
            w.write_all(c).unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    #[test]
    fn asset_ext_includes_svg_unlike_plugins() {
        assert!(SKELETON_ASSET_EXT.contains(&"svg"));
        assert_eq!(SKELETON_ASSET_EXT.len(), 9);
    }

    #[test]
    fn ext_and_basename_match_node() {
        assert_eq!(ext_lower("logo.SVG"), "svg");
        assert_eq!(ext_lower(".hidden"), "");
        assert_eq!(ext_lower("noext"), "");
        assert_eq!(ext_lower("file."), "");
        assert_eq!(basename("assets/backgrounds/a.png"), "a.png");
        assert_eq!(strip_assets_prefix("assets/backgrounds/a.png"), "a.png");
        assert_eq!(strip_assets_prefix("assets/sub/a.png"), "sub/a.png");
    }

    #[test]
    fn malformed_zip_is_rejected_not_panicked() {
        assert_eq!(import_skeleton_zip(&[]).unwrap_err(), "errors:skeleton.invalidZip");
        assert_eq!(import_skeleton_zip(b"not a zip").unwrap_err(), "errors:skeleton.invalidZip");
        assert_eq!(import_skeleton_zip(b"PK\x05\x06").unwrap_err(), "errors:skeleton.invalidZip");
    }

    #[test]
    fn too_many_entries_rejected_before_any_write() {
        let owned: Vec<(String, Vec<u8>)> =
            (0..201).map(|i| (format!("f{i}.txt"), b"x".to_vec())).collect();
        let refs: Vec<(&str, &[u8])> =
            owned.iter().map(|(n, c)| (n.as_str(), c.as_slice())).collect();
        assert_eq!(
            import_skeleton_zip(&make_zip(&refs)).unwrap_err(),
            "errors:skeleton.tooManyEntries"
        );
    }

    #[test]
    fn missing_manifest_rejected() {
        let zip = make_zip(&[("notes.txt", b"hi")]);
        assert_eq!(
            import_skeleton_zip(&zip).unwrap_err(),
            "errors:skeleton.missingManifest"
        );
    }

    #[test]
    fn invalid_theme_rejected_before_pass2() {
        // colorPrimary missing -> validate_theme error, before any asset write.
        let manifest = br##"{"theme":{"colorSecondary":"#2e1065","answerColors":["#000","#000","#000","#000"]}}"##;
        let zip = make_zip(&[("skeleton.json", manifest)]);
        assert_eq!(
            import_skeleton_zip(&zip).unwrap_err(),
            "errors:theme.missingColorPrimary"
        );
    }

    #[test]
    fn build_produces_valid_zip_with_manifest() {
        let bytes = build_skeleton_zip().expect("export builds");
        assert!(!bytes.is_empty());
        let mut a = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");
        assert!(a.by_name("skeleton.json").is_ok());
    }
}
