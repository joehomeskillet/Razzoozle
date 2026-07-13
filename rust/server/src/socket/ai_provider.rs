//! AI provider text generation: OpenAI-compatible or Anthropic backends.
//!
//! Public interface for generate_text, generate_question, generate_distractors, generate_quiz.
//! Delegates HTTP calls to ai_http, utility functions to ai_utils.
//!
//! User's own AI key (if set) takes precedence over admin global key.

use super::{ai_http, ai_secrets, ai_utils};
use serde_json::{json, Value};
use sqlx::PgPool;

#[derive(Debug)]
pub struct GenerateTextOptions {
    pub system: Option<String>,
    pub prompt: String,
    pub json: bool,
    pub max_tokens: Option<u32>,
    pub user_id: Option<i64>,
    pub db_pool: Option<PgPool>,
}

/// Get the API key for the active provider, checking user's key first, then admin global.
async fn resolve_provider_key(
    active_id: &str,
    user_id: Option<i64>,
    db_pool: Option<&PgPool>,
) -> Result<Option<String>, String> {
    // Check user's key first (if user_id and db_pool are provided)
    if let (Some(uid), Some(pool)) = (user_id, db_pool) {
        if let Ok(Some(key)) = crate::db::user_ai::get_user_ai_key(pool, uid, active_id).await {
            return Ok(Some(key));
        }
    }

    // Fall back to admin global key
    ai_secrets::get_key(active_id).ok().flatten().map(Ok).transpose()
}

/// Generate text via the active provider. Returns the raw model string (secret-scanned).
pub async fn generate_text(opts: GenerateTextOptions) -> Result<String, String> {
    let settings = crate::socket::ai_config::get_ai_settings();
    let active_id = settings["text"]["activeProvider"].as_str();

    if active_id.is_none() || active_id.unwrap() == "off" {
        return Err("errors:ai.notConfigured".to_string());
    }

    let active_id = active_id.unwrap();
    let providers = settings["text"]["providers"]
        .as_array()
        .ok_or("errors:ai.notConfigured".to_string())?;

    let provider = providers
        .iter()
        .find(|p| p["id"].as_str() == Some(active_id))
        .ok_or("errors:ai.notConfigured".to_string())?;

    let key = resolve_provider_key(active_id, opts.user_id, opts.db_pool.as_ref()).await?;
    let kind = provider["kind"].as_str().unwrap_or("openai-compatible");
    let model = provider["model"]
        .as_str()
        .ok_or("errors:ai.notConfigured".to_string())?;

    // Clamp temperature to [0, 2] with default 0.7.
    let temperature = provider["temperature"]
        .as_f64()
        .unwrap_or(0.7)
        .max(0.0)
        .min(2.0);

    let raw = if kind == "anthropic" {
        if key.is_none() {
            return Err("errors:ai.noKey".to_string());
        }
        ai_http::call_anthropic(
            model,
            &key.unwrap(),
            opts.system.as_deref(),
            &opts.prompt,
            opts.json,
            opts.max_tokens,
            temperature,
        )
        .await?
    } else {
        // openai-compatible
        let base_url = provider["baseUrl"].as_str();
        if base_url.is_none() {
            return Err("errors:ai.notConfigured".to_string());
        }

        if key.is_none() && !ai_utils::is_local_base_url(base_url) {
            return Err("errors:ai.noKey".to_string());
        }

        let mut messages = vec![];
        if let Some(sys) = opts.system {
            messages.push(("system".to_string(), sys));
        }

        let msg_content = if opts.json {
            format!(
                "{}\n\nRespond ONLY with valid JSON.",
                opts.prompt
            )
        } else {
            opts.prompt.clone()
        };
        messages.push(("user".to_string(), msg_content));

        ai_http::call_openai_compatible(
            base_url.unwrap(),
            model,
            key.as_deref(),
            messages,
            opts.json,
            temperature,
        )
        .await?
    };

    ai_utils::assert_no_secret(&raw)?;
    Ok(raw)
}

/// Generate a single question. Input: topic, type (choice|boolean|multiple-select|type-answer), language.
pub async fn generate_question(
    topic: &str,
    q_type: &str,
    language: &str,
    user_id: Option<i64>,
    db_pool: Option<PgPool>,
) -> Result<Value, String> {
    let shape_hint = match q_type {
        "choice" => r#"JSON shape: {"question": string, "answers": [4 strings], "correctIndex": number 0-3}."#,
        "boolean" => r#"JSON shape: {"question": string, "answer": boolean} where answer is true if the statement is correct."#,
        "multiple-select" => r#"JSON shape: {"question": string, "answers": [2-4 strings], "correctIndexes": [>=2 distinct indices]}."#,
        _ => r#"JSON shape: {"question": string, "acceptedAnswers": [1-5 short accepted strings]}."#,
    };

    let prompt = format!(
        r#"Write ONE quiz question of kind "{}" about: "{}". Language: {}. {}"#,
        q_type, topic, language, shape_hint
    );

    let system = "You are a quiz author. Produce a single high-quality quiz question. Output strict JSON only, no prose.";

    let raw = generate_text(GenerateTextOptions {
        system: Some(system.to_string()),
        prompt,
        json: true,
        max_tokens: Some(800),
        user_id,
        db_pool,
    })
    .await?;

    let parsed = ai_utils::parse_json(&raw)?;

    let mut built = json!({
        "question": parsed.get("question").and_then(|v| v.as_str()).unwrap_or(""),
        "time": 20,
        "cooldown": 5,
    });

    match q_type {
        "choice" => {
            let answers: Vec<String> = parsed
                .get("answers")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .take(4)
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .collect()
                })
                .unwrap_or_default();
            let idx = parsed
                .get("correctIndex")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;

            built["answers"] = Value::Array(answers.into_iter().map(Value::String).collect());
            built["solutions"] = json!([idx]);
        }
        "boolean" => {
            built["type"] = Value::String("boolean".to_string());
            built["answers"] = if language.starts_with("de") {
                json!(["Richtig", "Falsch"])
            } else {
                json!(["True", "False"])
            };
            let is_correct = parsed.get("answer").and_then(|v| v.as_bool()).unwrap_or(false);
            built["solutions"] = json!([if is_correct { 0 } else { 1 }]);
        }
        "multiple-select" => {
            built["type"] = Value::String("multiple-select".to_string());
            let answers: Vec<String> = parsed
                .get("answers")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .take(4)
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .collect()
                })
                .unwrap_or_default();
            let indices: Vec<u64> = parsed
                .get("correctIndexes")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64())
                        .collect()
                })
                .unwrap_or_default();

            built["answers"] = Value::Array(answers.into_iter().map(Value::String).collect());
            built["solutions"] = Value::Array(indices.into_iter().map(|i| json!(i)).collect());
        }
        _ => {
            // type-answer
            built["type"] = Value::String("type-answer".to_string());
            let accepted: Vec<String> = parsed
                .get("acceptedAnswers")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .take(20)
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();

            built["acceptedAnswers"] =
                Value::Array(accepted.into_iter().map(Value::String).collect());
            built["matchMode"] = Value::String("normalized".to_string());
        }
    }

    ai_utils::assert_no_secret(&built.to_string())?;
    Ok(built)
}

/// Generate distractor answers. Input: question, correct answer, count (1-3), language.
pub async fn generate_distractors(
    question: &str,
    correct: &str,
    count: usize,
    language: &str,
    user_id: Option<i64>,
    db_pool: Option<PgPool>,
) -> Result<Vec<String>, String> {
    let clamped = count.max(1).min(3);
    let system = "You produce plausible WRONG answers (distractors) for a quiz question. Output strict JSON only, no prose.";
    let prompt = format!(
        r#"Question: "{}". Correct answer: "{}". Return exactly {} plausible but WRONG short answers in {}, none equal to the correct answer. JSON shape: {{"distractors": [strings]}}."#,
        question, correct, clamped, language
    );

    let raw = generate_text(GenerateTextOptions {
        system: Some(system.to_string()),
        prompt,
        json: true,
        max_tokens: Some(400),
        user_id,
        db_pool,
    })
    .await?;

    let parsed = ai_utils::parse_json(&raw)?;
    let correct_lower = correct.to_lowercase();

    let distractors: Vec<String> = parsed
        .get("distractors")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter(|d| {
                    !d.is_empty() && d.to_lowercase().trim() != correct_lower.trim()
                })
                .take(3)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    if distractors.is_empty() || distractors.len() > 3 {
        return Err("errors:ai.invalidOutput".to_string());
    }

    ai_utils::assert_no_secret(&distractors.join("\n"))?;
    Ok(distractors)
}

/// Generate a full quiz. Input: topic, count (1-15), language.
pub async fn generate_quiz(
    topic: &str,
    count: usize,
    language: &str,
    user_id: Option<i64>,
    db_pool: Option<PgPool>,
) -> Result<Value, String> {
    let system = "You are a quiz author. Produce a full quiz of choice questions. Output strict JSON only, no prose.";
    let prompt = format!(
        r#"Write a quiz about "{}" with exactly {} multiple-choice questions in {}. JSON shape: {{"subject": string, "questions": [{{"question": string, "answers": [4 strings], "correctIndex": 0-3}}]}}"#,
        topic, count, language
    );

    let raw = generate_text(GenerateTextOptions {
        system: Some(system.to_string()),
        prompt,
        json: true,
        max_tokens: Some(2400),
        user_id,
        db_pool,
    })
    .await?;

    let parsed = ai_utils::parse_json(&raw)?;

    let raw_questions: Vec<Value> = parsed
        .get("questions")
        .and_then(|q| q.as_array())
        .map(|arr| arr.clone())
        .unwrap_or_default();

    let questions: Vec<Value> = raw_questions
        .into_iter()
        .map(|q| {
            let answers: Vec<String> = q
                .get("answers")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .take(4)
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .collect()
                })
                .unwrap_or_default();
            let idx = q
                .get("correctIndex")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;

            json!({
                "question": q.get("question").and_then(|v| v.as_str()).unwrap_or(""),
                "answers": answers,
                "solutions": [idx],
                "time": 20,
                "cooldown": 5,
            })
        })
        .collect();

    let subject = parsed
        .get("subject")
        .and_then(|s| s.as_str())
        .unwrap_or(topic);

    let quizz = json!({
        "subject": subject,
        "questions": questions,
    });

    ai_utils::assert_no_secret(&quizz.to_string())?;
    Ok(quizz)
}
