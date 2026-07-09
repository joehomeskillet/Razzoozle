//! Question validation mirroring Node's `questionValidator`
//! (`packages/common/src/validators/quizz.ts` superRefine + base schema).
//!
//! Returns `Result<(), &'static str>` where `Err` is an i18n key
//! (`errors:quizz.*`) matching the Node/Zod messages.

use razzoozle_protocol::quizz::{Question, QuestionType};
use serde_json::Value;

/// Validate a question payload against the Node `questionValidator` contract.
///
/// On failure returns the first matching i18n key (e.g. `errors:quizz.questionEmpty`).
pub fn validate_question(q: &Value) -> Result<(), &'static str> {
    // Node transforms `solutions: number` → `[number]` before refine.
    let mut normalized = q.clone();
    if let Some(obj) = normalized.as_object_mut() {
        if let Some(sol) = obj.get("solutions").cloned() {
            if sol.is_number() {
                obj.insert("solutions".to_string(), serde_json::json!([sol]));
            }
        }
    }

    let question: Question =
        serde_json::from_value(normalized).map_err(|_| "errors:quizz.invalidPayload")?;

    // Base: non-empty question text
    if question.question.is_empty() {
        return Err("errors:quizz.questionEmpty");
    }

    // cooldown 3–15, time 5–120 (Zod int ranges; no custom message → invalidPayload)
    if question.cooldown < 3 || question.cooldown > 15 {
        return Err("errors:quizz.invalidPayload");
    }
    if question.time < 5 || question.time > 120 {
        return Err("errors:quizz.invalidPayload");
    }

    // answers (when present): non-empty items, 2–4 length
    if let Some(ref answers) = question.answers {
        for a in answers {
            if a.is_empty() {
                return Err("errors:quizz.answerEmpty");
            }
        }
        if answers.len() < 2 {
            return Err("errors:quizz.tooFewAnswers");
        }
        if answers.len() > 4 {
            return Err("errors:quizz.tooManyAnswers");
        }
    }

    // chunks (when present): non-empty, max 40 chars each, max 16 items
    if let Some(ref chunks) = question.chunks {
        for c in chunks {
            if c.is_empty() {
                return Err("errors:quizz.chunkEmpty");
            }
            if c.chars().count() > 40 {
                return Err("errors:quizz.chunkTooLong");
            }
        }
        if chunks.len() > 16 {
            return Err("errors:quizz.invalidPayload");
        }
    }

    // acceptedAnswers (when present): non-empty items ≤200 chars, max 20
    if let Some(ref accepted) = question.accepted_answers {
        if accepted.len() > 20 {
            return Err("errors:quizz.invalidPayload");
        }
        for a in accepted {
            if a.is_empty() || a.chars().count() > 200 {
                return Err("errors:quizz.invalidPayload");
            }
        }
    }

    // media URL (Node questionMediaValidator)
    if let Some(ref media) = question.media {
        if !is_valid_media_url(&media.url) {
            return Err("errors:quizz.invalidMediaUrl");
        }
    }

    // Per-type superRefine (mirrors Node)
    match question.r#type.as_ref() {
        Some(QuestionType::Slider) => {
            let (min, max, correct) = match (question.min, question.max, question.correct) {
                (Some(min), Some(max), Some(correct)) => (min, max, correct),
                _ => return Err("errors:quizz.sliderMissing"),
            };
            if min >= max {
                return Err("errors:quizz.sliderRange");
            }
            if correct < min || correct > max {
                return Err("errors:quizz.sliderCorrect");
            }
        }
        Some(QuestionType::Poll) => {
            // Opinion vote: needs answers, no correct solution.
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
        }
        Some(QuestionType::MultipleSelect) => {
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
            if question.solutions.as_ref().map(|s| s.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.solutionsMin2");
            }
        }
        Some(QuestionType::TypeAnswer) => {
            if question
                .accepted_answers
                .as_ref()
                .map(|a| a.len())
                .unwrap_or(0)
                < 1
            {
                return Err("errors:quizz.acceptedAnswersMin");
            }
        }
        Some(QuestionType::SentenceBuilder) => {
            if question.chunks.as_ref().map(|c| c.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewChunks");
            }
        }
        // choice / boolean / None → default
        _ => {
            if question.answers.as_ref().map(|a| a.len()).unwrap_or(0) < 2 {
                return Err("errors:quizz.tooFewAnswers");
            }
            if question.solutions.as_ref().map(|s| s.len()).unwrap_or(0) < 1 {
                return Err("errors:quizz.noSolution");
            }
        }
    }

    Ok(())
}

/// Absolute http(s) URL or site-relative `/media/` / `/theme/` path (no `..`).
fn is_valid_media_url(url: &str) -> bool {
    if url.is_empty() {
        return false;
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        return !url.chars().any(|c| c.is_whitespace());
    }
    if url.contains("..") {
        return false;
    }
    if let Some(rest) = url.strip_prefix("/media/") {
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    if let Some(rest) = url.strip_prefix("/theme/") {
        return !rest.is_empty() && !rest.chars().any(|c| c.is_whitespace());
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn choice_ok() {
        let q = json!({
            "question": "2+2?",
            "type": "choice",
            "answers": ["3", "4"],
            "solutions": [1],
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }

    #[test]
    fn empty_question() {
        let q = json!({
            "question": "",
            "answers": ["a", "b"],
            "solutions": [0],
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.questionEmpty"));
    }

    #[test]
    fn slider_missing() {
        let q = json!({
            "question": "age?",
            "type": "slider",
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.sliderMissing"));
    }

    #[test]
    fn multiple_select_needs_two_solutions() {
        let q = json!({
            "question": "pick two",
            "type": "multiple-select",
            "answers": ["a", "b", "c"],
            "solutions": [0],
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(validate_question(&q), Err("errors:quizz.solutionsMin2"));
    }

    #[test]
    fn type_answer_needs_accepted() {
        let q = json!({
            "question": "capital?",
            "type": "type-answer",
            "cooldown": 5,
            "time": 20
        });
        assert_eq!(
            validate_question(&q),
            Err("errors:quizz.acceptedAnswersMin")
        );
    }

    #[test]
    fn solutions_number_normalized() {
        let q = json!({
            "question": "2+2?",
            "answers": ["3", "4"],
            "solutions": 1,
            "cooldown": 5,
            "time": 20
        });
        assert!(validate_question(&q).is_ok());
    }
}
