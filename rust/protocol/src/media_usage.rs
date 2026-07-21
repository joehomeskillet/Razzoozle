//! media_usage.rs — OWNS: MediaUsageEntry
//! Tracks where a media item is used in quizzes.
//! Filled by WP-L: media-usage-map

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A record of where a media item is used: quiz ID, quiz title, question index, and question label.
/// Part of MediaMeta.usage field (optional, populated server-side).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MediaUsageEntry {
    pub quiz_id: String,
    pub quiz_title: String,
    pub question_index: u32,
    pub question_label: String,
}
