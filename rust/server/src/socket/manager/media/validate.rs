use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref DATA_URL_REGEX: Regex = Regex::new(r"^data:([^;,]+);base64,(.+)$").unwrap();
    static ref DATA_URL_VALIDATOR_REGEX: Regex = Regex::new(r"^data:(?:image|audio)\/").unwrap();
}

/// Validate upload payload and return (filename, dataUrl, category) or error message.
/// Mimics Zod validation: returns first error message if validation fails.
pub(super) fn validate_upload_payload(payload: &serde_json::Value) -> Result<(&str, &str, Option<&str>), String> {
    // Validate filename: required, string, 1-200 chars
    let filename = match payload.get("filename").and_then(|v| v.as_str()) {
        Some(f) if !f.is_empty() && f.len() <= 200 => f,
        Some(_) => return Err("errors:media.invalidDataUrl".to_string()),
        None => return Err("errors:media.invalidDataUrl".to_string()),
    };

    // Validate dataUrl: required, string, regex /^data:(?:image|audio)\/
    let data_url = match payload.get("dataUrl").and_then(|v| v.as_str()) {
        Some(d) if DATA_URL_VALIDATOR_REGEX.is_match(d) => d,
        Some(_) => return Err("errors:media.invalidDataUrl".to_string()),
        None => return Err("errors:media.invalidDataUrl".to_string()),
    };

    // Validate category: optional, enum of valid categories
    let category = payload
        .get("category")
        .and_then(|v| v.as_str())
        .map(|c| {
            // Validate against allowed categories: backgrounds, questions, generated, avatars, audio
            match c {
                "backgrounds" | "questions" | "generated" | "avatars" | "audio" => Ok(c),
                _ => Err("errors:media.invalidDataUrl".to_string()),
            }
        })
        .transpose()?;

    Ok((filename, data_url, category))
}

/// Validate delete payload and return ID or error message.
pub(super) fn validate_delete_payload(payload: &serde_json::Value) -> Result<&str, String> {
    // Validate id: required, string, min 1 char
    match payload.get("id").and_then(|v| v.as_str()) {
        Some(id) if !id.is_empty() => Ok(id),
        _ => Err("errors:media.invalidId".to_string()),
    }
}

/// Decode a data URL and extract MIME type and base64-decoded buffer.
pub(super) fn decode_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let caps = DATA_URL_REGEX
        .captures(data_url)
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?;

    let mime = caps
        .get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?
        .to_string();

    let base64_part = caps
        .get(2)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?;

    let buffer = super::super::theme::decode_base64(base64_part)
        .map_err(|_| "errors:media.invalidDataUrl".to_string())?;

    Ok((mime, buffer))
}

/// Infer media type from MIME and validate against allowed MIME types.
/// Also resolves category (default: audio->audio, else->questions).
pub(super) fn infer_type_and_validate_mime(
    mime: &str,
    category: Option<&str>,
) -> Result<(String, String), String> {
    let inferred_type = if mime.starts_with("video/") {
        "video"
    } else if mime.starts_with("audio/") {
        "audio"
    } else {
        "image"
    };

    // Validate MIME type
    if inferred_type == "image" {
        if !mime.starts_with("image/png")
            && !mime.starts_with("image/jpeg")
            && !mime.starts_with("image/webp")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    } else if inferred_type == "audio" {
        if !mime.starts_with("audio/mpeg")
            && !mime.starts_with("audio/mp3")
            && !mime.starts_with("audio/wav")
            && !mime.starts_with("audio/ogg")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    } else if inferred_type == "video" {
        if !mime.starts_with("video/mp4")
            && !mime.starts_with("video/webm")
            && !mime.starts_with("video/ogg")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    }

    // Resolve category: Node semantics (audio→"audio", else→"questions")
    let resolved_category = if let Some(cat) = category {
        cat.to_string()
    } else if inferred_type == "audio" {
        "audio".to_string()
    } else {
        "questions".to_string()
    };

    Ok((inferred_type.to_string(), resolved_category))
}

/// Map MIME type to file extension.
/// parity: raw bytes + honest extension, not .webp transcode (Wave 4b)
pub(super) fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        "audio/mpeg" | "audio/mp3" => ".mp3",
        "audio/wav" => ".wav",
        "audio/ogg" => ".ogg",
        "video/mp4" => ".mp4",
        "video/webm" => ".webm",
        "video/ogg" => ".ogv",
        _ => ".bin",
    }
}
