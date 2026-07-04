use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Question media type (image, video, or audio).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(rename = "QuestionMediaType")]
pub enum QuestionMediaType {
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "video")]
    Video,
    #[serde(rename = "audio")]
    Audio,
}

/// Media attached to a question.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(rename = "QuestionMedia")]
pub struct QuestionMedia {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<QuestionMediaType>,
    pub url: String,
}

/// Question type (choice, slider, poll, etc.).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(rename = "QuestionType")]
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
}

/// SELECT_ANSWER status payload — sent to players during the answer-selection phase.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(rename = "SelectAnswerPayload")]
pub struct SelectAnswerPayload {
    pub question: String,

    /// Answer option texts (absent for slider/poll questions).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answers: Option<Vec<String>>,

    /// Media (image/video/audio) attached to the question.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<QuestionMedia>,

    /// Time limit (milliseconds) for answering.
    pub time: i64,

    /// Total number of players in the game.
    #[serde(rename = "totalPlayer")]
    pub total_player: i64,

    /// Question type (choice, slider, poll, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<QuestionType>,

    /// Slider min value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,

    /// Slider max value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,

    /// Slider step value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,

    /// Slider unit label (e.g., "°C", "%").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,

    /// Sentence-builder: shuffled word chips (no solution info).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "shuffledChunks")]
    pub shuffled_chunks: Option<Vec<String>>,

    /// Low-latency mode: server sequence number.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "serverSeq")]
    pub server_seq: Option<i64>,

    /// Low-latency mode: server timestamp (milliseconds since epoch).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "serverNowMs")]
    pub server_now_ms: Option<i64>,

    /// Low-latency mode: question start time (milliseconds since epoch).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "questionStartAtServerMs")]
    pub question_start_at_server_ms: Option<i64>,

    /// Low-latency mode: answer deadline time (milliseconds since epoch).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "answerDeadlineAtServerMs")]
    pub answer_deadline_at_server_ms: Option<i64>,

    /// Name of the manager/user who submitted this question.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "submittedBy")]
    pub submitted_by: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_select_answer_minimal() {
        let payload = SelectAnswerPayload {
            question: "What is 2+2?".to_string(),
            answers: Some(vec!["3".to_string(), "4".to_string(), "5".to_string()]),
            media: None,
            time: 10000,
            total_player: 5,
            r#type: Some(QuestionType::Choice),
            min: None,
            max: None,
            step: None,
            unit: None,
            shuffled_chunks: None,
            server_seq: None,
            server_now_ms: None,
            question_start_at_server_ms: None,
            answer_deadline_at_server_ms: None,
            submitted_by: None,
        };

        let json = serde_json::to_value(&payload).unwrap();
        println!("Minimal payload: {}", serde_json::to_string_pretty(&json).unwrap());

        // Verify camelCase in serialized JSON
        assert!(json.get("totalPlayer").is_some());
        assert!(json.get("total_player").is_none());
    }

    #[test]
    fn test_select_answer_full() {
        let payload = SelectAnswerPayload {
            question: "On a scale of 1-10, how happy are you?".to_string(),
            answers: None,
            media: Some(QuestionMedia {
                r#type: Some(QuestionMediaType::Image),
                url: "https://example.com/image.jpg".to_string(),
            }),
            time: 15000,
            total_player: 20,
            r#type: Some(QuestionType::Slider),
            min: Some(1.0),
            max: Some(10.0),
            step: Some(1.0),
            unit: Some("points".to_string()),
            shuffled_chunks: None,
            server_seq: Some(42),
            server_now_ms: Some(1688000000000),
            question_start_at_server_ms: Some(1688000000000),
            answer_deadline_at_server_ms: Some(1688000015000),
            submitted_by: Some("John Doe".to_string()),
        };

        let json = serde_json::to_value(&payload).unwrap();
        println!("Full payload: {}", serde_json::to_string_pretty(&json).unwrap());
    }

    #[test]
    fn test_select_answer_sentence_builder() {
        let payload = SelectAnswerPayload {
            question: "Arrange the words in the correct order".to_string(),
            answers: None,
            media: None,
            time: 20000,
            total_player: 10,
            r#type: Some(QuestionType::SentenceBuilder),
            min: None,
            max: None,
            step: None,
            unit: None,
            shuffled_chunks: Some(vec![
                "The".to_string(),
                "quick".to_string(),
                "brown".to_string(),
                "fox".to_string(),
            ]),
            server_seq: None,
            server_now_ms: None,
            question_start_at_server_ms: None,
            answer_deadline_at_server_ms: None,
            submitted_by: None,
        };

        let json = serde_json::to_value(&payload).unwrap();
        println!("Sentence-builder payload: {}", serde_json::to_string_pretty(&json).unwrap());
    }
}
