//! ComfyUI HTTP pipeline (txt2img + img2img) + generated-image disk persistence
//! and the prompt-enhance bridge. Mirrors packages/socket/src/services/comfyui.ts.
//!
//! The generated PNG bytes are fetched from ComfyUI over HTTP (`/view`) — the
//! socket container can't read ComfyUI's output dir — then written RAW as `.png`
//! into config/media/generated/ (nginx-servable via the config mount, mirrors
//! /theme/). The Node WebP transcode is a Wave-4b deferral, so we keep the honest
//! `.png` extension. When ComfyUI is unreachable/misconfigured, every path yields
//! the natural `errors:submission.imageGen*` error (no fake-success stub).

use rand::Rng;
use serde_json::{json, Value};
use uuid::Uuid;

use super::config_root;

const DEFAULT_COMFYUI_URL: &str = "http://127.0.0.1:8188";
const DEFAULT_TXT2IMG_WORKFLOW: &str = "./workflows/txt2img-zimage-turbo.json";
const DEFAULT_IMG2IMG_WORKFLOW: &str = "./workflows/sketch2img-zimage-turbo.json";
const IMAGE_RESOLUTION_DEFAULT: u64 = 1024;

// txt2img node ids (txt2img-zimage-turbo.json).
const PROMPT_NODE: &str = "6"; // CLIPTextEncode positive — .inputs.text
const SAMPLER_NODE: &str = "3"; // KSampler — .inputs.seed
const SAVE_NODE: &str = "9"; // SaveImage — history images[0].filename
const LATENT_NODE: &str = "5"; // EmptyLatentImage — .inputs.width/height
// img2img node ids — DISTINCT from txt2img: node 6 is TextEncodeZImageOmni whose
// prompt field is `.inputs.prompt` (NOT `.inputs.text`).
const IMG2IMG_PROMPT_NODE: &str = "6";
const IMG2IMG_LOADIMAGE_NODE: &str = "12";
const IMG2IMG_SAMPLER_NODE: &str = "3";
const IMG2IMG_SAVE_NODE: &str = "9";

const POLL_INTERVAL_MS: u64 = 1000;
// Cold Z-Image model load (~30-40s) + ~8-step render + queue can exceed a minute;
// ceiling generously so a legit slow render isn't reported as a timeout.
const POLL_TIMEOUT_MS: u64 = 180_000;

const FAILED: &str = "errors:submission.imageGenFailed";
const TIMEOUT: &str = "errors:submission.imageGenTimeout";

// System prompt for the server-internal enhance (byte-identical to Node's
// ENHANCE_SYSTEM_PROMPT in services/ai-provider.ts).
const ENHANCE_SYSTEM_PROMPT: &str = "You rewrite a rough quiz-image idea into a single optimized prompt for Z-Image-Turbo.\nOutput ONLY the final prompt text: one natural-language paragraph, max 80 words, no quotes,\nno markdown, no commentary. Start with a concise photographic style frame (clean, well-lit,\nneutral studio or contextual setting, balanced composition, realistic). Describe subject +\nsetting + composition concisely. Do NOT add quality tags like masterpiece, best quality, 8k,\nultra-detailed, hyperrealistic. Keep it safe-for-work and suitable as a quiz question\nillustration. The idea may be German; produce an English prompt.";

fn comfyui_url() -> String {
    std::env::var("COMFYUI_URL").unwrap_or_else(|_| DEFAULT_COMFYUI_URL.to_string())
}

fn txt2img_workflow_path() -> String {
    std::env::var("COMFYUI_WORKFLOW").unwrap_or_else(|_| DEFAULT_TXT2IMG_WORKFLOW.to_string())
}

fn img2img_workflow_path() -> String {
    std::env::var("COMFYUI_IMG2IMG_WORKFLOW").unwrap_or_else(|_| DEFAULT_IMG2IMG_WORKFLOW.to_string())
}

fn read_workflow(path: &str) -> Result<Value, String> {
    let raw = std::fs::read_to_string(path).map_err(|_| FAILED.to_string())?;
    serde_json::from_str::<Value>(&raw).map_err(|_| FAILED.to_string())
}

fn random_seed() -> u64 {
    rand::thread_rng().gen_range(0..1_000_000_000u64)
}

fn short_id() -> String {
    Uuid::new_v4().simple().to_string().chars().take(8).collect()
}

/// Square output resolution from the active image provider (config/ai-settings),
/// default 1024. txt2img only — img2img deliberately keeps the base aspect.
fn image_resolution() -> u64 {
    let settings = crate::socket::ai_config::get_ai_settings();
    let image = &settings["image"];
    let active = image["activeProvider"].as_str().unwrap_or("");
    image["providers"]
        .as_array()
        .and_then(|arr| arr.iter().find(|p| p["id"].as_str() == Some(active)))
        .and_then(|p| p["resolution"].as_u64())
        .unwrap_or(IMAGE_RESOLUTION_DEFAULT)
}

/// txt2img: generate an image for `prompt`, returning its public
/// "/media/generated/<id>.png" URL. Errors with `errors:submission.imageGen*`.
pub(crate) async fn generate_image(prompt: &str) -> Result<String, String> {
    let mut workflow = read_workflow(&txt2img_workflow_path())?;

    // Positive prompt (.inputs.text). A workflow missing node 6 / its inputs is
    // unusable — hard-fail (parity with Node's guard).
    if !workflow[PROMPT_NODE]["inputs"].is_object() {
        return Err(FAILED.to_string());
    }
    workflow[PROMPT_NODE]["inputs"]["text"] = json!(prompt);

    // Square latent (guarded: a bundled workflow lacking node 5 must no-op).
    let resolution = image_resolution();
    if workflow[LATENT_NODE]["inputs"].is_object() {
        workflow[LATENT_NODE]["inputs"]["width"] = json!(resolution);
        workflow[LATENT_NODE]["inputs"]["height"] = json!(resolution);
    }

    // Randomize the seed so repeated prompts don't return an identical image.
    if workflow[SAMPLER_NODE]["inputs"].is_object() {
        workflow[SAMPLER_NODE]["inputs"]["seed"] = json!(random_seed());
    }

    queue_and_collect(workflow, SAVE_NODE).await
}

/// img2img (Z-Image Omni reference-conditioning): re-generate from `base_bytes`
/// (resolved server-side from disk by the caller — never a client URL/fetch)
/// conditioned on `prompt`. `ext` is the base file's extension (for the upload
/// filename/MIME). Returns the public "/media/generated/<id>.png" URL.
pub(crate) async fn generate_image_from_base(
    base_bytes: &[u8],
    ext: &str,
    prompt: &str,
) -> Result<String, String> {
    let mut workflow = read_workflow(&img2img_workflow_path())?;

    if !workflow[IMG2IMG_PROMPT_NODE]["inputs"].is_object()
        || !workflow[IMG2IMG_LOADIMAGE_NODE]["inputs"].is_object()
    {
        return Err(FAILED.to_string());
    }

    // Upload the base image to ComfyUI's input dir over HTTP, then wire LoadImage
    // to the name the endpoint RETURNS (it may dedup-rename).
    let uploaded_name = upload_base_image(base_bytes, ext).await?;

    // TextEncodeZImageOmni positive prompt — NOTE `.inputs.prompt`, NOT `.text`.
    workflow[IMG2IMG_PROMPT_NODE]["inputs"]["prompt"] = json!(prompt);
    workflow[IMG2IMG_LOADIMAGE_NODE]["inputs"]["image"] = json!(uploaded_name);

    // Randomize the seed (keep denoise as-is — identity comes from the Omni node).
    if workflow[IMG2IMG_SAMPLER_NODE]["inputs"].is_object() {
        workflow[IMG2IMG_SAMPLER_NODE]["inputs"]["seed"] = json!(random_seed());
    }

    queue_and_collect(workflow, IMG2IMG_SAVE_NODE).await
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

/// POST the base bytes to ComfyUI's `/upload/image` as multipart/form-data (built
/// by hand — reqwest's `multipart` feature isn't enabled) and return the stored
/// name ComfyUI reports.
async fn upload_base_image(base_bytes: &[u8], ext: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let filename = format!("edit-{}.{}", short_id(), ext);
    let mime = mime_for_ext(ext);
    let boundary = format!("----razzoozle{}", Uuid::new_v4().simple());

    let mut body: Vec<u8> = Vec::with_capacity(base_bytes.len() + 512);
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"image\"; filename=\"{}\"\r\n",
            filename
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime).as_bytes());
    body.extend_from_slice(base_bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"overwrite\"\r\n\r\n");
    body.extend_from_slice(b"true\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let resp = client
        .post(format!("{}/upload/image", comfyui_url()))
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(body)
        .send()
        .await
        .map_err(|_| FAILED.to_string())?;

    if !resp.status().is_success() {
        return Err(FAILED.to_string());
    }

    let data: Value = resp.json().await.map_err(|_| FAILED.to_string())?;
    data["name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| FAILED.to_string())
}

/// Queue a prepared workflow on ComfyUI, poll `/history` until the SaveImage node
/// reports an output file, fetch its bytes over `/view`, persist them and return
/// the public URL. Shared by txt2img + img2img (only workflow-prep differs).
async fn queue_and_collect(workflow: Value, save_node: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let base = comfyui_url();

    // Queue the prompt.
    let prompt_id = {
        let resp = client
            .post(format!("{}/prompt", base))
            .json(&json!({ "prompt": workflow }))
            .send()
            .await
            .map_err(|_| FAILED.to_string())?;
        if !resp.status().is_success() {
            return Err(FAILED.to_string());
        }
        let data: Value = resp.json().await.map_err(|_| FAILED.to_string())?;
        match data["prompt_id"].as_str() {
            Some(id) if !id.is_empty() => id.to_string(),
            _ => return Err(FAILED.to_string()),
        }
    };

    // Poll history until the SaveImage node reports an output (or we time out).
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_millis(POLL_TIMEOUT_MS);

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;

        let resp = match client
            .get(format!("{}/history/{}", base, prompt_id))
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r,
            _ => continue, // transient — keep polling until the deadline
        };
        let history: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entry = &history[prompt_id.as_str()];

        // A node failed mid-execution (e.g. LoadImage on a corrupt base image):
        // ComfyUI records status_str "error" with no outputs. Bail fast.
        if entry["status"]["status_str"].as_str() == Some("error") {
            return Err(FAILED.to_string());
        }

        let img = &entry["outputs"][save_node]["images"][0];
        let filename = match img["filename"].as_str() {
            Some(f) if !f.is_empty() => f.to_string(),
            _ => continue,
        };
        let subfolder = img["subfolder"].as_str().unwrap_or("").to_string();
        let img_type = img["type"].as_str().unwrap_or("output").to_string();

        match fetch_and_save(&client, &base, &filename, &subfolder, &img_type).await {
            Ok(url) => return Ok(url),
            Err(_) => continue, // transient fetch error after ready — keep polling
        }
    }

    Err(TIMEOUT.to_string())
}

async fn fetch_and_save(
    client: &reqwest::Client,
    base: &str,
    filename: &str,
    subfolder: &str,
    img_type: &str,
) -> Result<String, String> {
    let resp = client
        .get(format!("{}/view", base))
        .query(&[
            ("filename", filename),
            ("subfolder", subfolder),
            ("type", img_type),
        ])
        .send()
        .await
        .map_err(|_| FAILED.to_string())?;

    if !resp.status().is_success() {
        return Err(FAILED.to_string());
    }

    let bytes = resp.bytes().await.map_err(|_| FAILED.to_string())?;
    save_generated_image_bytes(bytes.as_ref(), &format!("gen-{}.png", short_id()))
}

/// Persist generated image bytes into config/media/generated/ and return the
/// public "/media/generated/<name>" URL. Validates the stem (parity: assertSafeId)
/// before touching disk.
fn save_generated_image_bytes(bytes: &[u8], dest_name: &str) -> Result<String, String> {
    let stem = dest_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(dest_name);
    crate::state::safe_asset_id(stem).map_err(|_| FAILED.to_string())?;

    let dir = config_root().join("media").join("generated");
    std::fs::create_dir_all(&dir).map_err(|_| FAILED.to_string())?;
    std::fs::write(dir.join(dest_name), bytes).map_err(|_| FAILED.to_string())?;

    Ok(format!("/media/generated/{}", dest_name))
}

/// Rewrite a rough image idea into an optimized Z-Image prompt via the active
/// text provider. `generate_text` secret-scans its own output (assert_no_secret),
/// so this errors on provider-off / missing-key / provider-error / secret-output;
/// callers wrap it and fall back to the raw idea (enhancement never blocks gen).
pub(crate) async fn enhance_prompt(raw_idea: &str) -> Result<String, String> {
    let enhanced = crate::socket::ai_provider::generate_text(
        crate::socket::ai_provider::GenerateTextOptions {
            system: Some(ENHANCE_SYSTEM_PROMPT.to_string()),
            prompt: raw_idea.to_string(),
            json: false,
            max_tokens: Some(150),
        },
    )
    .await?;

    Ok(enhanced.trim().to_string())
}
