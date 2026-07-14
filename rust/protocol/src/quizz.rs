//! quizz.rs — OWNS: Question, QuestionMedia, Quizz, QuizzWithId,
//! QUIZZ (quizz:*) + CATALOG (catalog:*) payloads, and CatalogEntry.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Question media — image/video/audio attached to a question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QuestionMedia {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub r#type: Option<String>,
    pub url: String,
}

/// Question type enum
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum QuestionType {
    #[serde(rename = "choice")]
    Choice,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "slider")]
    Slider,
    #[serde(rename = "poll")]
    Poll,
    #[serde(rename = "multiple-select")]
    MultipleSelect,
    #[serde(rename = "type-answer")]
    TypeAnswer,
    #[serde(rename = "sentence-builder")]
    SentenceBuilder,
    #[serde(rename = "mathematik")]
    Mathematik,
    #[serde(rename = "wortarten")]
    Wortarten,
}

/// A single question in a quiz
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub r#type: Option<QuestionType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub media: Option<QuestionMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub solutions: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub correct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub chunks: Option<Vec<String>>,
    pub cooldown: i32,
    pub time: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub practice: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bonus: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub submitted_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub accepted_answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub match_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tolerance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub decimals: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sentence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tokens: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pos_set: Option<Vec<String>>,
}

/// A complete quiz definition
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Quizz {
    pub subject: String,
    pub questions: Vec<Question>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub theme_id: Option<String>,
}

/// A quiz with its server-assigned ID
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QuizzWithId {
    pub id: String,
    pub subject: String,
    pub questions: Vec<Question>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub theme_id: Option<String>,
}

/// Catalog source
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum CatalogSource {
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "submission")]
    Submission,
    #[serde(rename = "editor")]
    Editor,
    #[serde(rename = "ai")]
    Ai,
}

/// A global label (Fach) defined by admin — orthogonal to subject titles, can tag quizzes/media/catalog.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
}

/// A reusable question in the catalog
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub question: Question,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label_ids: Option<Vec<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source: Option<CatalogSource>,
    pub added_at: String,
}

/// quizz:saveSuccess response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QuizzSaveSuccessPayload {
    pub id: String,
}

/// quizz:updateSuccess response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QuizzUpdateSuccessPayload {
    pub id: String,
}

/// quizz:setArchived request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QuizzSetArchivedPayload {
    pub id: String,
    pub archived: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_question_serde_round_trip() {
        let json = r#"{"question": "What is 2+2?", "type": "choice", "answers": ["3", "4", "5"], "solutions": [1], "cooldown": 10, "time": 30}"#;
        let question: Question = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&question).unwrap();
        let deserialized: Question = serde_json::from_str(&serialized).unwrap();
        assert_eq!(question, deserialized);
    }

    #[test]
    fn test_quizz_with_id_serde_round_trip() {
        let json = r#"{"id": "quiz-123", "subject": "Basic Math", "questions": [{"question": "What is 2+2?", "answers": ["3", "4", "5"], "solutions": [1], "cooldown": 10, "time": 30}], "archived": false, "themeId": "theme-abc"}"#;
        let quiz: QuizzWithId = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&quiz).unwrap();
        let deserialized: QuizzWithId = serde_json::from_str(&serialized).unwrap();
        assert_eq!(quiz, deserialized);
    }

    #[test]
    fn test_catalog_entry_serde_round_trip() {
        let json = r#"{"id": "cat-entry-1", "question": {"question": "Capital of France?", "answers": ["London", "Paris", "Berlin"], "solutions": [1], "cooldown": 10, "time": 30}, "tags": ["geography", "europe"], "source": "manual", "addedAt": "2026-07-05T10:00:00Z"}"#;
        let entry: CatalogEntry = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&entry).unwrap();
        let deserialized: CatalogEntry = serde_json::from_str(&serialized).unwrap();
        assert_eq!(entry, deserialized);
    }

    #[test]
    fn test_slider_question_serde_round_trip() {
        let json = r#"{"question": "How old are you?", "type": "slider", "min": 0, "max": 120, "correct": 25, "step": 1, "unit": "years", "cooldown": 10, "time": 30}"#;
        let question: Question = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&question).unwrap();
        let deserialized: Question = serde_json::from_str(&serialized).unwrap();
        assert_eq!(question, deserialized);
    }

    #[test]
    fn test_question_media_serde_round_trip() {
        let json = r#"{"type": "image", "url": "https://example.com/image.jpg"}"#;
        let media: QuestionMedia = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&media).unwrap();
        let deserialized: QuestionMedia = serde_json::from_str(&serialized).unwrap();
        assert_eq!(media, deserialized);
    }

    #[test]
    fn test_question_with_media_serde_round_trip() {
        let json = r#"{"question": "Look at the image and answer", "media": {"type": "image", "url": "/media/gen-abc.webp"}, "answers": ["option1", "option2"], "solutions": [0], "cooldown": 10, "time": 30}"#;
        let question: Question = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&question).unwrap();
        let deserialized: Question = serde_json::from_str(&serialized).unwrap();
        assert_eq!(question, deserialized);
    }

    #[test]
    fn test_sentence_builder_question_serde_round_trip() {
        let json = r#"{"question": "Arrange these words", "type": "sentence-builder", "chunks": ["The", "quick", "brown", "fox"], "cooldown": 10, "time": 30}"#;
        let question: Question = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&question).unwrap();
        let deserialized: Question = serde_json::from_str(&serialized).unwrap();
        assert_eq!(question, deserialized);
    }

    #[test]
    fn test_type_answer_question_serde_round_trip() {
        let json = r#"{"question": "What is the capital of France?", "type": "type-answer", "acceptedAnswers": ["Paris", "paris"], "matchMode": "normalized", "cooldown": 15, "time": 45}"#;
        let question: Question = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&question).unwrap();
        let deserialized: Question = serde_json::from_str(&serialized).unwrap();
        assert_eq!(question, deserialized);
    }

    #[test]
    fn test_quizz_save_success_serde_round_trip() {
        let json = r#"{"id": "quiz-456"}"#;
        let payload: QuizzSaveSuccessPayload = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&payload).unwrap();
        let deserialized: QuizzSaveSuccessPayload = serde_json::from_str(&serialized).unwrap();
        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_quizz_set_archived_serde_round_trip() {
        let json = r#"{"id": "quiz-789", "archived": true}"#;
        let payload: QuizzSetArchivedPayload = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&payload).unwrap();
        let deserialized: QuizzSetArchivedPayload = serde_json::from_str(&serialized).unwrap();
        assert_eq!(payload, deserialized);
    }
}
