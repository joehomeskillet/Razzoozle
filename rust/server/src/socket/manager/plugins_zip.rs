//! Plugin ZIP import pipeline (Node services/config/plugins.ts importPluginZip).
//!
//! Size caps + entry caps + manifest validation + zip-slip/path-traversal
//! guards, extraction to config/plugins/<id>/ and index upsert. Values are the
//! VERIFIED Node constants (spec_plugins.md ORCHESTRATOR-VERIFIKATION ruling 1;
//! theme-skeleton.ts:23-25 + handlers/manager/plugins.ts:18-19) — NOT the
//! guessed figures in the older spec body.
//!
//! Extension allowlist = Node PLUGIN_ASSET_EXT (services/config/plugins.ts:39-54):
//! SKELETON_ASSET_EXT minus "svg" (public /plugins/:id/* route must never serve
//! browser-renderable markup — same-origin XSS) plus code/manifest/style/font
//! extensions. NO mp4/webm/ogv — those exist only in Node's serving MIME map,
//! not in the import allowlist.

use razzoozle_protocol::manager::InstalledPlugin;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::Path;

/// 16 MB raw-byte cap (handlers/manager/plugins.ts:18), mirrored by the HTTP
/// /api/plugins/import path in Node.
pub(crate) const PLUGIN_ZIP_MAX_BYTES: usize = 16 * 1024 * 1024;
/// base64 encodes 3 bytes per 4 chars → char cap = ceil(bytes / 3) * 4.
pub(crate) const PLUGIN_ZIP_MAX_B64_LEN: usize = PLUGIN_ZIP_MAX_BYTES.div_ceil(3) * 4;
/// theme-skeleton.ts:25 — max ZIP entries (dirs included, like Object.values).
const SKELETON_ENTRY_MAX: usize = 200;
/// theme-skeleton.ts:24 — 32 MB total decompressed bytes.
const SKELETON_TOTAL_MAX_BYTES: usize = 32 * 1024 * 1024;
/// theme-skeleton.ts:23 — 512 KB per single decompressed file.
const SKELETON_ASSET_MAX_BYTES: usize = 512 * 1024;

pub(crate) const PLUGIN_ASSET_EXT: [&str; 16] = [
    "webp", "png", "jpg", "jpeg", "woff2", "mp3", "wav", "ogg", // skeleton media (minus svg)
    "js", "mjs", "cjs", "json", "css", "ttf", "woff", "gif", // plugin additions
];

const INSTALL_FAILED: &str = "errors:plugin.installFailed";

// ── Validators ───────────────────────────────────────────────────────────────

/// Node validators/plugin.ts safeId = /^[a-z0-9][a-z0-9-]{0,63}$/.
fn is_plugin_safe_id(id: &str) -> bool {
    let b = id.as_bytes();
    if b.is_empty() || b.len() > 64 {
        return false;
    }
    (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b[1..]
            .iter()
            .all(|&c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// Node zip-slip guard (services/config/plugins.ts:244-251): leading slash or
/// backslash, "..", or a NUL byte anywhere → silently skip the entry.
fn is_unsafe_entry_name(name: &str) -> bool {
    name.starts_with('/') || name.starts_with('\\') || name.contains("..") || name.contains('\0')
}

/// Node path.extname(rel).slice(1).toLowerCase(): extension of the basename,
/// "" for dotfiles (".hidden") and names without a dot.
fn ext_of(name: &str) -> String {
    let base = name.rsplit('/').next().unwrap_or(name);
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => base[i + 1..].to_lowercase(),
    }
}

#[cfg_attr(test, derive(Debug))]
pub(super) struct ParsedManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub config: HashMap<String, Value>,
}

/// Mirror of Node pluginManifestValidator (packages/common/src/validators/
/// plugin.ts:33-80) — same accept/reject decisions, zod-default semantics
/// (defaults apply to ABSENT fields only; null/wrong type fails). Deviation:
/// Node emits the raw ZodError JSON blob on failure (which the client filters
/// out); we emit the catch-all key — and "errors:plugin.invalidId" for any
/// missing/non-string/regex-failing id, which is strictly more informative.
fn validate_manifest(v: &Value) -> Result<ParsedManifest, String> {
    let fail = || INSTALL_FAILED.to_string();
    let obj = v.as_object().ok_or_else(fail)?;

    // formatVersion: z.number().int().min(1).default(1)
    if let Some(fv) = obj.get("formatVersion") {
        if !fv.as_i64().map(|n| n >= 1).unwrap_or(false) {
            return Err(fail());
        }
    }

    // id: z.string().regex(safeId, "errors:plugin.invalidId")
    let id = obj.get("id").and_then(|x| x.as_str()).unwrap_or("");
    if !is_plugin_safe_id(id) {
        return Err("errors:plugin.invalidId".to_string());
    }

    // version: z.string().min(1)
    let version = obj
        .get("version")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(fail)?;

    // name: z.string().min(1).max(80)
    let name = obj
        .get("name")
        .and_then(|x| x.as_str())
        .filter(|s| (1..=80).contains(&s.chars().count()))
        .ok_or_else(fail)?;

    // tab: required { nameKey: string, icon: string, gated: enum default "always" }
    let tab = obj.get("tab").and_then(|x| x.as_object()).ok_or_else(fail)?;
    if tab.get("nameKey").and_then(|x| x.as_str()).is_none()
        || tab.get("icon").and_then(|x| x.as_str()).is_none()
    {
        return Err(fail());
    }
    if let Some(g) = tab.get("gated") {
        if !matches!(g.as_str(), Some("always") | Some("devMode")) {
            return Err(fail());
        }
    }

    // capabilities: z.array(z.string()).default([])
    let capabilities = match obj.get("capabilities") {
        None => Vec::new(),
        Some(Value::Array(a)) => {
            let mut out = Vec::with_capacity(a.len());
            for c in a {
                out.push(c.as_str().ok_or_else(fail)?.to_string());
            }
            out
        }
        Some(_) => return Err(fail()),
    };

    // hooks: object, client/server strings when present (unused here — no JS
    // runtime — but accept/reject parity matters).
    if let Some(h) = obj.get("hooks") {
        let h = h.as_object().ok_or_else(fail)?;
        if h.get("client").map(|c| !c.is_string()).unwrap_or(false)
            || h.get("server").map(|s| !s.is_string()).unwrap_or(false)
        {
            return Err(fail());
        }
    }

    // config: z.record(z.string(), z.unknown()).default({})
    let config: HashMap<String, Value> = match obj.get("config") {
        None => HashMap::new(),
        Some(Value::Object(m)) => m.iter().map(|(k, val)| (k.clone(), val.clone())).collect(),
        Some(_) => return Err(fail()),
    };

    // i18n (v2, inert): record of records of strings when present.
    if let Some(i) = obj.get("i18n") {
        let langs = i.as_object().ok_or_else(fail)?;
        for bundle in langs.values() {
            let entries = bundle.as_object().ok_or_else(fail)?;
            if entries.values().any(|s| !s.is_string()) {
                return Err(fail());
            }
        }
    }

    // sandbox: z.enum(["none", "iframe"]).default("none")
    if let Some(s) = obj.get("sandbox") {
        if !matches!(s.as_str(), Some("none") | Some("iframe")) {
            return Err(fail());
        }
    }

    // lifecycleHooks (v2): array of the four hook names when present.
    if let Some(lh) = obj.get("lifecycleHooks") {
        for h in lh.as_array().ok_or_else(fail)? {
            if !matches!(
                h.as_str(),
                Some("onQuestionShown") | Some("onResult") | Some("onLeaderboard") | Some("onGameEnd")
            ) {
                return Err(fail());
            }
        }
    }

    // renderSlot (v2): { events: enum[] } when present.
    if let Some(rs) = obj.get("renderSlot") {
        let o = rs.as_object().ok_or_else(fail)?;
        for e in o.get("events").and_then(|e| e.as_array()).ok_or_else(fail)? {
            if !matches!(
                e.as_str(),
                Some("SHOW_QUESTION") | Some("SHOW_RESULT") | Some("SHOW_LEADERBOARD") | Some("FINISHED")
            ) {
                return Err(fail());
            }
        }
    }

    Ok(ParsedManifest {
        id: id.to_string(),
        name: name.to_string(),
        version: version.to_string(),
        capabilities,
        config,
    })
}

// ── Export pipeline ──────────────────────────────────────────────────────────

/// Recursively collect regular files under `dir` (symlink-safe via lstat),
/// sorted by relative path for deterministic ZIP bytes across re-exports.
fn collect_plugin_files(dir: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut out = Vec::new();
    fn walk(base: &Path, abs: &Path, out: &mut Vec<(String, Vec<u8>)>) -> Result<(), String> {
        let mut entries: Vec<_> = fs::read_dir(abs)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                walk(base, &path, out)?;
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let content = fs::read(&path).map_err(|e| e.to_string())?;
            out.push((rel, content));
        }
        Ok(())
    }
    walk(dir, dir, &mut out)?;
    Ok(out)
}

/// Pack config/plugins/<id>/ into a ZIP (Node buildPluginZip).
/// Sorted paths + default fixed mtime → stable bytes for export→import→export.
pub(crate) fn build_plugin_zip(id: &str) -> Result<Vec<u8>, String> {
    if !super::plugins::is_generic_safe_id(id) {
        return Err("Invalid id".to_string());
    }

    let dir = super::plugins::plugin_dir(id);
    if !dir.is_dir() {
        return Err("errors:plugin.notFound".to_string());
    }

    let files = collect_plugin_files(&dir)?;
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    // SimpleFileOptions::default() uses DateTime::DEFAULT (1980-01-01) — fixed
    // mtime so re-export of the same files is byte-identical.
    let opts = zip::write::SimpleFileOptions::default();

    for (rel, content) in files {
        zip.start_file(rel, opts).map_err(|e| e.to_string())?;
        zip.write_all(&content).map_err(|e| e.to_string())?;
    }

    Ok(zip.finish().map_err(|e| e.to_string())?.into_inner())
}

/// Base64 map of all files under config/plugins/<id>/ for Postgres files jsonb
/// (Node buildFilesMap).
pub(crate) fn build_plugin_files_map(id: &str) -> Result<Value, String> {
    let dir = super::plugins::plugin_dir(id);
    if !dir.is_dir() {
        return Ok(Value::Object(Default::default()));
    }
    let files = collect_plugin_files(&dir)?;
    let mut map = serde_json::Map::new();
    for (rel, content) in files {
        map.insert(rel, Value::String(encode_base64_std(&content)));
    }
    Ok(Value::Object(map))
}

/// Standard base64 (RFC 4648) for PG files jsonb — same alphabet as Node.
fn encode_base64_std(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &byte in bytes {
        buf = (buf << 8) | u32::from(byte);
        bits += 8;
        while bits >= 6 {
            bits -= 6;
            result.push(CHARS[((buf >> bits) & 0x3f) as usize] as char);
        }
    }
    if bits > 0 {
        result.push(CHARS[((buf << (6 - bits)) & 0x3f) as usize] as char);
    }
    while result.len() % 4 != 0 {
        result.push('=');
    }
    result
}

// ── Import pipeline ──────────────────────────────────────────────────────────

/// Parse + validate a plugin ZIP, extract to config/plugins/<id>/, upsert the
/// index. Errors are the EXACT strings Node emits (or its catch-all). Never
/// panics on attacker-controlled bytes — every fallible step maps to an Err.
pub(crate) fn import_plugin_zip(bytes: &[u8]) -> Result<InstalledPlugin, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|_| INSTALL_FAILED.to_string())?;

    if archive.len() > SKELETON_ENTRY_MAX {
        return Err("errors:plugin.tooManyEntries".to_string());
    }

    // Pass 1 (Node plugins.ts:192-209): decompress every file entry, enforcing
    // total-cap BEFORE per-entry-cap (same error-key precedence as Node). The
    // per-entry read is hard-capped at TOTAL+1 bytes so a zip bomb can never
    // materialize more than ~2x the total cap in memory (Node reads unbounded).
    let mut entries: Vec<(String, Vec<u8>, bool)> = Vec::new();
    let mut total_bytes = 0usize;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|_| INSTALL_FAILED.to_string())?;
        if file.is_dir() {
            continue;
        }

        // Symlink entries are skipped at write time (spec ruling: never write
        // a symlink), but still counted here like any Node buffer.
        let is_symlink = file
            .unix_mode()
            .map(|m| m & 0o170000 == 0o120000)
            .unwrap_or(false);

        let mut buf = Vec::new();
        (&mut file)
            .take(SKELETON_TOTAL_MAX_BYTES as u64 + 1)
            .read_to_end(&mut buf)
            .map_err(|_| INSTALL_FAILED.to_string())?;

        total_bytes += buf.len();
        if total_bytes > SKELETON_TOTAL_MAX_BYTES {
            return Err("errors:plugin.tooLarge".to_string());
        }
        if buf.len() > SKELETON_ASSET_MAX_BYTES {
            return Err("errors:plugin.assetTooLarge".to_string());
        }

        entries.push((file.name().to_string(), buf, is_symlink));
    }

    // Manifest: last "plugin.json" wins (Node's Map.set overwrites duplicates).
    let manifest_raw = entries
        .iter()
        .rev()
        .find(|(n, _, _)| n == "plugin.json")
        .map(|(_, b, _)| b.as_slice())
        .ok_or_else(|| "errors:plugin.missingManifest".to_string())?;

    let parsed: Value =
        serde_json::from_slice(manifest_raw).map_err(|_| INSTALL_FAILED.to_string())?;
    let manifest = validate_manifest(&parsed)?;

    // On-disk re-assertion (Node assertSafeId after the wire validator; catches
    // the prototype-pollution ids the plugin regex admits).
    if !super::plugins::is_generic_safe_id(&manifest.id) {
        return Err("Invalid id".to_string());
    }

    if super::plugins::read_plugins_index()
        .iter()
        .any(|p| p.id == manifest.id)
    {
        return Err("errors:plugin.idCollision".to_string());
    }

    // Pass 2 (Node plugins.ts:231-268): write allowlisted, traversal-safe
    // entries under config/plugins/<id>/.
    let dir = super::plugins::plugin_dir(&manifest.id);
    fs::create_dir_all(&dir).map_err(|_| INSTALL_FAILED.to_string())?;

    for (name, content, is_symlink) in &entries {
        if *is_symlink || is_unsafe_entry_name(name) {
            continue;
        }
        if !PLUGIN_ASSET_EXT.contains(&ext_of(name).as_str()) {
            continue;
        }

        let dest = dir.join(name);
        // Defence-in-depth (Node plugins.ts:262): the joined path must stay
        // inside <dir>. With "..", leading "/" and "\" already rejected this
        // cannot trigger, but keep the guard anyway.
        if !dest.starts_with(&dir) {
            continue;
        }

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|_| INSTALL_FAILED.to_string())?;
        }
        fs::write(&dest, content).map_err(|_| INSTALL_FAILED.to_string())?;
    }

    // Snapshot BEFORE the index mutation (Node plugins.ts:270), then upsert.
    super::plugins::save_plugin_revision().map_err(|_| INSTALL_FAILED.to_string())?;

    let record = InstalledPlugin {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        enabled: true,
        capabilities: manifest.capabilities,
        config: Some(manifest.config),
    };

    let mut list = super::plugins::read_plugins_index();
    list.push(record.clone());
    super::plugins::write_plugins_index(&list).map_err(|_| INSTALL_FAILED.to_string())?;

    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_safe_id_matches_node_regex() {
        assert!(is_plugin_safe_id("a"));
        assert!(is_plugin_safe_id("my-plugin-2"));
        assert!(is_plugin_safe_id(&"a".repeat(64)));
        assert!(!is_plugin_safe_id(""));
        assert!(!is_plugin_safe_id(&"a".repeat(65)));
        assert!(!is_plugin_safe_id("-leading-dash"));
        assert!(!is_plugin_safe_id("Upper"));
        assert!(!is_plugin_safe_id("under_score"));
        assert!(!is_plugin_safe_id("dot.dot"));
    }

    #[test]
    fn generic_safe_id_matches_node_assert_safe_id() {
        use crate::socket::manager::plugins::is_generic_safe_id;
        assert!(is_generic_safe_id("Upper_ok-123"));
        assert!(!is_generic_safe_id(""));
        assert!(!is_generic_safe_id("has/slash"));
        assert!(!is_generic_safe_id("__proto__"));
        assert!(!is_generic_safe_id("constructor"));
        assert!(!is_generic_safe_id("prototype"));
    }

    #[test]
    fn ext_of_mirrors_node_extname() {
        assert_eq!(ext_of("ui.js"), "js");
        assert_eq!(ext_of("assets/logo.PNG"), "png");
        assert_eq!(ext_of("a.b.woff2"), "woff2");
        assert_eq!(ext_of("noext"), "");
        assert_eq!(ext_of(".hidden"), "");
        assert_eq!(ext_of("file."), "");
    }

    #[test]
    fn unsafe_entry_names_are_flagged() {
        assert!(is_unsafe_entry_name("/abs.js"));
        assert!(is_unsafe_entry_name("\\win.js"));
        assert!(is_unsafe_entry_name("a/../../etc/passwd"));
        assert!(is_unsafe_entry_name("nul\0.js"));
        assert!(!is_unsafe_entry_name("assets/ok.png"));
    }

    #[test]
    fn allowlist_excludes_svg_and_video() {
        for banned in ["svg", "mp4", "webm", "ogv", "html", "exe", ""] {
            assert!(!PLUGIN_ASSET_EXT.contains(&banned), "{banned} must be banned");
        }
        for ok in ["js", "json", "css", "png", "woff2", "gif"] {
            assert!(PLUGIN_ASSET_EXT.contains(&ok), "{ok} must be allowed");
        }
    }

    #[test]
    fn manifest_validation_accepts_minimal_and_rejects_bad_id() {
        let good = serde_json::json!({
            "id": "demo", "version": "1.0.0", "name": "Demo",
            "tab": { "nameKey": "demo.tab", "icon": "puzzle" },
        });
        let m = validate_manifest(&good).expect("minimal manifest must pass");
        assert_eq!(m.id, "demo");
        assert!(m.capabilities.is_empty());
        assert!(m.config.is_empty());

        let bad_id = serde_json::json!({
            "id": "Bad_Id", "version": "1", "name": "x",
            "tab": { "nameKey": "k", "icon": "i" },
        });
        assert_eq!(
            validate_manifest(&bad_id).unwrap_err(),
            "errors:plugin.invalidId"
        );

        let missing_tab = serde_json::json!({ "id": "demo", "version": "1", "name": "x" });
        assert_eq!(validate_manifest(&missing_tab).unwrap_err(), INSTALL_FAILED);
    }

    #[test]
    fn b64_cap_is_ceil_of_byte_cap() {
        // ceil(16 MiB / 3) * 4 — matches Node Math.ceil(PLUGIN_ZIP_MAX_BYTES/3)*4.
        assert_eq!(PLUGIN_ZIP_MAX_B64_LEN, 22_369_624);
    }

    #[test]
    fn malformed_zip_never_panics() {
        assert_eq!(import_plugin_zip(&[]).unwrap_err(), INSTALL_FAILED);
        assert_eq!(import_plugin_zip(b"not a zip").unwrap_err(), INSTALL_FAILED);
        // Truncated central-directory magic.
        assert_eq!(import_plugin_zip(b"PK\x05\x06").unwrap_err(), INSTALL_FAILED);
    }

    /// export → import → re-export must be byte-identical, and on-disk files
    /// must match the fixture (Node plugin ZIP roundtrip contract).
    #[test]
    fn test_plugin_roundtrip() {
        use std::sync::Mutex;
        // Serialise CONFIG_PATH mutation across tests in this binary.
        static ENV_LOCK: Mutex<()> = Mutex::new(());
        let _guard = ENV_LOCK.lock().unwrap();

        let config = std::env::temp_dir().join(format!(
            "razzoozle-plugin-roundtrip-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&config);
        fs::create_dir_all(config.join("plugins")).unwrap();

        let prev = std::env::var_os("CONFIG_PATH");
        std::env::set_var("CONFIG_PATH", &config);

        let id = "roundtrip-demo";
        let dir = super::super::plugins::plugin_dir(id);
        fs::create_dir_all(dir.join("assets")).unwrap();

        let manifest = r#"{
  "formatVersion": 1,
  "id": "roundtrip-demo",
  "version": "1.0.0",
  "name": "Roundtrip Demo",
  "capabilities": ["MANAGER_TAB"],
  "tab": { "nameKey": "demo.tab", "icon": "puzzle", "gated": "always" },
  "hooks": { "client": "ui.js" },
  "config": { "flag": true },
  "sandbox": "none"
}"#;
        let ui_js = b"// roundtrip ui\nexport default function() {}\n";
        let css = b".roundtrip { color: red; }\n";
        let dummy_png = b"\x89PNG\r\n\x1a\nroundtrip-dummy";

        fs::write(dir.join("plugin.json"), manifest).unwrap();
        fs::write(dir.join("ui.js"), ui_js).unwrap();
        fs::write(dir.join("assets/styles.css"), css).unwrap();
        fs::write(dir.join("assets/icon.png"), dummy_png).unwrap();

        let zip_a = build_plugin_zip(id).expect("export fixture");

        // Clear disk so import can re-install the same id.
        fs::remove_dir_all(&dir).unwrap();
        assert!(
            !super::super::plugins::read_plugins_index()
                .iter()
                .any(|p| p.id == id)
        );

        let installed = import_plugin_zip(&zip_a).expect("import exported zip");
        assert_eq!(installed.id, id);
        assert_eq!(installed.name, "Roundtrip Demo");
        assert_eq!(installed.version, "1.0.0");
        assert!(installed.enabled);
        assert_eq!(installed.capabilities, vec!["MANAGER_TAB".to_string()]);

        // On-disk files match the fixture content (allowlisted entries only).
        assert_eq!(fs::read(dir.join("ui.js")).unwrap(), ui_js);
        assert_eq!(fs::read(dir.join("assets/styles.css")).unwrap(), css);
        assert_eq!(fs::read(dir.join("assets/icon.png")).unwrap(), dummy_png);
        let on_disk_manifest: Value =
            serde_json::from_slice(&fs::read(dir.join("plugin.json")).unwrap()).unwrap();
        assert_eq!(on_disk_manifest["id"], "roundtrip-demo");

        let zip_b = build_plugin_zip(id).expect("re-export after import");
        assert_eq!(
            zip_a, zip_b,
            "export → import → re-export must be byte-identical"
        );

        let _ = fs::remove_dir_all(&config);
        match prev {
            Some(v) => std::env::set_var("CONFIG_PATH", v),
            None => std::env::remove_var("CONFIG_PATH"),
        }
    }
}
