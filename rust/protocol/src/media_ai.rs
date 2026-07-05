//! media_ai.rs — OWNS: MEDIA (media:*) + AI (ai:*) domains, MediaMeta,
//! AISettingsPublic, AITestResult, and the image-gen submission payloads
//! (manager:generateImage/editImage/submitUploadImage/enhancePrompt +
//! their S2C counterparts imageGenerated/imageError/uploadImageSuccess/
//! promptEnhanced).
//!
// filled by WP-media_ai

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ============================================================================
// MEDIA Domain Types
// ============================================================================

/// A single media-library item tracked in config/media-manifest.json and shown
/// in the manager Media tab. `url` is same-origin relative (/media/<cat>/<file>).
/// Corresponds to wire events: media:data (array).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MediaMeta {
    pub id: String,
    pub filename: String,
    pub url: String,
    pub size: u32,
    #[serde(rename = "type")]
    pub media_type: String, // "image" | "audio" | "video"
    pub category: String,   // MediaCategory constant
    pub source: String,     // "upload" | "ai" | "theme"
    pub uploaded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

/// S2C: media:data — List of all media items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MediaDataPayload(pub Vec<MediaMeta>);

/// S2C: media:uploadSuccess — Confirmation of successful upload (no payload).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MediaUploadSuccessPayload;

/// S2C: media:error — Media operation error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MediaErrorPayload(pub String); // i18n key or message

/// C2S: media:delete — Delete a media item by ID.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MediaDeletePayload {
    pub id: String,
}

// C2S: media:upload — Upload a media file (shape validated on server).
// Not exported to TS; handled as serde_json::Value on wire
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaUploadPayload(pub serde_json::Value);

// ============================================================================
// AI Provider Configuration Types
// ============================================================================

/// A configured text provider (no secret — see ai-secrets server-side).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AIProviderConfig {
    pub id: String,
    pub label: String,
    pub kind: String, // AIProviderKind constant
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
}

/// Image generation provider configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AIImageProviderConfig {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<u32>,
}

/// Text provider extended with keyConfigured flag (sent to client).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AIProviderPublic {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    pub key_configured: bool,
}

/// Text provider settings (public version with keyConfigured).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AITextSettingsPublic {
    pub active_provider: String,
    pub providers: Vec<AIProviderPublic>,
}

/// Image provider settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AIImageSettings {
    pub active_provider: String,
    pub providers: Vec<AIImageProviderConfig>,
}

/// Public AI settings sent to client (never carries secrets).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AISettingsPublic {
    pub text: AITextSettingsPublic,
    pub image: AIImageSettings,
}

/// Result of testing provider connectivity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AITestResult {
    pub ok: bool,
    pub message: String, // i18n key or provider message
}

// ============================================================================
// Image Generation Request Payloads (C2S)
// ============================================================================

/// C2S: manager:generateImage — Request image generation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImagePayload {
    pub prompt: String,
}

/// C2S: manager:editImage — Request image editing from a base image.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct EditImagePayload {
    pub base_url: String,
    pub prompt: String,
}

/// C2S: manager:submitUploadImage — Submit an uploaded image for storage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SubmitUploadImagePayload {
    pub filename: String,
    pub data_url: String,
}

/// C2S: manager:enhancePrompt — Request prompt enhancement/refinement.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct EnhancePromptPayload {
    pub prompt: String,
}

// ============================================================================
// Image Generation Response Payloads (S2C)
// ============================================================================

/// S2C: manager:imageGenerated — Image generation succeeded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ImageGeneratedPayload {
    pub url: String,
}

/// S2C: manager:imageError — Image generation or upload failed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageErrorPayload(pub String); // i18n key or error message

/// S2C: manager:uploadImageSuccess — Image upload succeeded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageSuccessPayload {
    pub url: String,
}

/// S2C: manager:promptEnhanced — Prompt enhancement succeeded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhancedPayload {
    pub prompt: String,
}

// ============================================================================
// AI Configuration Request Payloads (C2S) — Not exported; server-validated
// ============================================================================

// C2S: ai:setSettings — Update AI provider settings (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AISetSettingsPayload(pub serde_json::Value);

// C2S: ai:setKey — Set or clear one provider's API key (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AISetKeyPayload(pub serde_json::Value);

// C2S: ai:testProvider — Test connectivity to a provider (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AITestProviderPayload(pub serde_json::Value);

// ============================================================================
// AI Generation Request Payloads (C2S) — Not exported; server-validated
// ============================================================================

// C2S: ai:generateQuestion — Request AI-generated question (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AIGenerateQuestionPayload(pub serde_json::Value);

// C2S: ai:generateDistracters — Request AI-generated distractor answers (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AIGenerateDistractorsPayload(pub serde_json::Value);

// C2S: ai:generateQuiz — Request AI-generated quiz (shape validated on server)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AIGenerateQuizPayload(pub serde_json::Value);

// ============================================================================
// AI Configuration Response Payloads (S2C)
// ============================================================================

/// S2C: ai:settings — Current AI settings (public, no secrets).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AISettingsPayload(pub AISettingsPublic);

/// S2C: ai:setSettingsSuccess — AI settings updated successfully.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AISetSettingsSuccessPayload;

/// S2C: ai:testResult — Result of provider connectivity test.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AITestResultPayload(pub AITestResult);

// ============================================================================
// AI Generation Response Payloads (S2C)
// ============================================================================

/// S2C: ai:questionGenerated — AI-generated question.
/// Uses serde_json::Value for question payload (owned by game module).
/// Not exported to TS; cross-module dependency.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AIQuestionGeneratedPayload {
    pub question: serde_json::Value,
}

/// S2C: ai:distractorsGenerated — AI-generated distractor answers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AIDistractorsGeneratedPayload {
    pub distractors: Vec<String>,
}

/// S2C: ai:quizGenerated — AI-generated quiz.
/// Uses serde_json::Value for quiz payload (owned by game/quizz module).
/// Not exported to TS; cross-module dependency.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AIQuizGeneratedPayload {
    pub quizz: serde_json::Value,
}

/// S2C: ai:error — AI operation error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AIErrorPayload(pub String); // i18n key or error message

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ========================================================================
    // MediaMeta Tests
    // ========================================================================

    #[test]
    fn test_media_meta_roundtrip_with_dimensions() {
        let json = r#"{"id":"img1","filename":"test.png","url":"/media/image/test.png","size":1024,"type":"image","category":"question","source":"upload","uploadedAt":"2026-01-01T00:00:00Z","width":800,"height":600}"#;
        let media: MediaMeta = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&media).expect("serialize");
        let media2: MediaMeta = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(media, media2);
        assert_eq!(media.media_type, "image");
        assert_eq!(media.width, Some(800));
        assert_eq!(media.height, Some(600));
    }

    #[test]
    fn test_media_meta_roundtrip_without_dimensions() {
        let json = r#"{"id":"audio1","filename":"sound.mp3","url":"/media/audio/sound.mp3","size":2048,"type":"audio","category":"bgm","source":"upload","uploadedAt":"2026-01-01T00:00:00Z"}"#;
        let media: MediaMeta = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&media).expect("serialize");
        let media2: MediaMeta = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(media, media2);
        assert_eq!(media.width, None);
        assert_eq!(media.height, None);
    }

    // ========================================================================
    // AIProviderConfig Tests
    // ========================================================================

    #[test]
    fn test_ai_provider_config_roundtrip() {
        let json = r#"{"id":"gpt4","label":"GPT-4","kind":"openai","baseUrl":"https://api.openai.com","model":"gpt-4","temperature":0.7}"#;
        let provider: AIProviderConfig = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&provider).expect("serialize");
        let provider2: AIProviderConfig = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(provider, provider2);
    }

    #[test]
    fn test_ai_test_result_roundtrip_success() {
        let json = r#"{"ok":true,"message":"Connection successful"}"#;
        let result: AITestResult = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&result).expect("serialize");
        let result2: AITestResult = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(result, result2);
        assert!(result.ok);
    }

    #[test]
    fn test_generate_image_payload_roundtrip() {
        let json = r#"{"prompt":"a red car in the snow"}"#;
        let payload: GenerateImagePayload = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&payload).expect("serialize");
        let payload2: GenerateImagePayload = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(payload, payload2);
    }

    #[test]
    fn test_image_generated_payload_roundtrip() {
        let json = r#"{"url":"https://cdn.example.com/generated/img123.png"}"#;
        let payload: ImageGeneratedPayload = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&payload).expect("serialize");
        let payload2: ImageGeneratedPayload = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(payload, payload2);
    }

    #[test]
    fn test_ai_distractors_generated_payload_roundtrip() {
        let json = r#"{"distractors":["wrong1","wrong2","wrong3"]}"#;
        let payload: AIDistractorsGeneratedPayload = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&payload).expect("serialize");
        let payload2: AIDistractorsGeneratedPayload = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(payload, payload2);
        assert_eq!(payload.distractors.len(), 3);
    }

    #[test]
    fn test_ai_settings_payload_roundtrip() {
        let json = r#"{"text":{"activeProvider":"gpt4","providers":[]},"image":{"activeProvider":"comfy","providers":[]}}"#;
        let payload: AISettingsPayload = serde_json::from_str(json).expect("parse");
        let serialized = serde_json::to_string(&payload).expect("serialize");
        let payload2: AISettingsPayload = serde_json::from_str(&serialized).expect("reparse");
        assert_eq!(payload, payload2);
    }
}
