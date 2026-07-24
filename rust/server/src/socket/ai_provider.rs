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

/// JSON shape hints for LLM prompts — one entry per platform question type.
fn shape_hint_for_type(q_type: &str) -> &'static str {
    match q_type {
        "choice" => {
            r#"JSON shape: {"question": string, "answers": [4 strings], "correctIndex": number 0-3}."#
        }
        "boolean" => {
            r#"JSON shape: {"question": string, "answer": boolean} where answer is true if the statement is correct."#
        }
        "multiple-select" => {
            r#"JSON shape: {"question": string, "answers": [2-4 strings], "correctIndexes": [>=2 distinct indices]}."#
        }
        "type-answer" => {
            r#"JSON shape: {"question": string, "acceptedAnswers": [1-5 short accepted strings]}."#
        }
        "sentence-builder" => {
            r#"JSON shape: {"question": string, "chunks": [2-12 word strings in correct order]}."#
        }
        "sequencing" => {
            r#"JSON shape: {"question": string, "items": [{"id": string, "label": string}, ... at least 2]}. correct order = array order."#
        }
        "mathematik" => {
            r#"JSON shape: {"question": string, "correct": number, "tolerance": number, "decimals": number}."#
        }
        "wortarten" => {
            r#"JSON shape: {"question": string, "sentence": string, "tokens": string[], "posSet": string[], "solutions": number[] indices into posSet}."#
        }
        "fill-blank" => {
            r#"JSON shape: {"question": string, "segments": string[] (len=slots+1), "slots": [{"options": string[], "correctIndex": number}]}."#
        }
        "matching" => {
            r#"JSON shape: {"question": string, "leftItems": [{"label": string, "options": string[], "correctIndex": number}]}."#
        }
        "drop-pin" => {
            r#"JSON shape: {"question": string, "hotspots": [{"x":0-1,"y":0-1,"w":0-1,"h":0-1}]}. Image media is supplied separately."#
        }
        "slider" => {
            r#"JSON shape: {"question": string, "min": number, "max": number, "correct": number, "unit": string optional}."#
        }
        "poll" => r#"JSON shape: {"question": string, "answers": [2-4 opinion strings]}."#,
        _ => {
            r#"JSON shape: {"question": string, "answers": [4 strings], "correctIndex": number 0-3}."#
        }
    }
}

fn str_list(parsed: &Value, key: &str, max: usize) -> Vec<String> {
    parsed
        .get(key)
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .take(max)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// Map LLM JSON into a question object the editor / engine understand.
/// Pure (no network) — unit-tested for every type.
pub(crate) fn map_llm_to_question(q_type: &str, parsed: &Value, language: &str) -> Value {
    let mut built = json!({
        "question": parsed.get("question").and_then(|v| v.as_str()).unwrap_or(""),
        "type": q_type,
        "time": 20,
        "cooldown": 5,
    });

    match q_type {
        "choice" => {
            let answers = str_list(parsed, "answers", 4);
            let idx = parsed
                .get("correctIndex")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            built["answers"] = Value::Array(answers.into_iter().map(Value::String).collect());
            built["solutions"] = json!([idx]);
        }
        "boolean" => {
            built["answers"] = if language.starts_with("de") {
                json!(["Richtig", "Falsch"])
            } else {
                json!(["True", "False"])
            };
            let is_correct = parsed
                .get("answer")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            built["solutions"] = json!([if is_correct { 0 } else { 1 }]);
        }
        "multiple-select" => {
            let answers = str_list(parsed, "answers", 4);
            let indices: Vec<u64> = parsed
                .get("correctIndexes")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_u64()).collect())
                .unwrap_or_default();
            built["answers"] = Value::Array(answers.into_iter().map(Value::String).collect());
            built["solutions"] = Value::Array(indices.into_iter().map(|i| json!(i)).collect());
        }
        "type-answer" => {
            let accepted = str_list(parsed, "acceptedAnswers", 20);
            built["acceptedAnswers"] =
                Value::Array(accepted.into_iter().map(Value::String).collect());
            built["matchMode"] = Value::String("normalized".to_string());
        }
        "sentence-builder" => {
            let mut chunks = str_list(parsed, "chunks", 16);
            if chunks.len() < 2 {
                chunks = vec!["A".into(), "B".into()];
            }
            built["chunks"] = Value::Array(chunks.into_iter().map(Value::String).collect());
        }
        "sequencing" => {
            let items: Vec<Value> = parsed
                .get("items")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .enumerate()
                        .map(|(i, it)| {
                            let id = it
                                .get("id")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| format!("item-{i}"));
                            let label = it
                                .get("label")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .or_else(|| it.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                                .unwrap_or_else(|| format!("Item {}", i + 1));
                            json!({ "id": id, "label": label })
                        })
                        .collect()
                })
                .unwrap_or_else(|| {
                    vec![
                        json!({ "id": "a", "label": "First" }),
                        json!({ "id": "b", "label": "Second" }),
                    ]
                });
            let order: Vec<Value> = items
                .iter()
                .filter_map(|it| it.get("id").cloned())
                .collect();
            built["items"] = Value::Array(items);
            built["correctOrder"] = Value::Array(order);
        }
        "mathematik" => {
            built["correct"] = json!(parsed.get("correct").and_then(|v| v.as_f64()).unwrap_or(0.0));
            built["tolerance"] =
                json!(parsed.get("tolerance").and_then(|v| v.as_f64()).unwrap_or(0.1));
            built["decimals"] =
                json!(parsed.get("decimals").and_then(|v| v.as_u64()).unwrap_or(2));
        }
        "wortarten" => {
            built["sentence"] = json!(parsed
                .get("sentence")
                .and_then(|v| v.as_str())
                .unwrap_or(""));
            let tokens = str_list(parsed, "tokens", 64);
            let mut pos_set = str_list(parsed, "posSet", 16);
            if pos_set.is_empty() {
                pos_set = vec![
                    "Nomen".into(),
                    "Verb".into(),
                    "Adjektiv".into(),
                    "Artikel".into(),
                ];
            }
            let solutions: Vec<Value> = parsed
                .get("solutions")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)))
                        .map(|n| json!(n))
                        .collect()
                })
                .unwrap_or_default();
            built["tokens"] = Value::Array(tokens.into_iter().map(Value::String).collect());
            built["posSet"] = Value::Array(pos_set.into_iter().map(Value::String).collect());
            built["solutions"] = Value::Array(solutions);
        }
        "fill-blank" => {
            let mut segments = str_list(parsed, "segments", 16);
            let slots = parsed
                .get("slots")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_else(|| vec![json!({ "options": ["A", "B"], "correctIndex": 0 })]);
            if segments.len() < slots.len() + 1 {
                segments.resize(slots.len() + 1, String::new());
            }
            built["segments"] = Value::Array(segments.into_iter().map(Value::String).collect());
            built["slots"] = Value::Array(slots);
        }
        "matching" => {
            let left = parsed
                .get("leftItems")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_else(|| {
                    vec![json!({ "label": "A", "options": ["1", "2"], "correctIndex": 0 })]
                });
            built["leftItems"] = Value::Array(left);
        }
        "drop-pin" => {
            built["media"] = json!({
                "type": "image",
                "url": "/media/placeholder-map.webp",
            });
            let hotspots = parsed
                .get("hotspots")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_else(|| vec![json!({ "x": 0.3, "y": 0.3, "w": 0.2, "h": 0.2 })]);
            built["hotspots"] = Value::Array(hotspots);
        }
        "slider" => {
            built["min"] = json!(parsed.get("min").and_then(|v| v.as_f64()).unwrap_or(0.0));
            built["max"] = json!(parsed.get("max").and_then(|v| v.as_f64()).unwrap_or(100.0));
            built["correct"] =
                json!(parsed.get("correct").and_then(|v| v.as_f64()).unwrap_or(50.0));
            if let Some(unit) = parsed.get("unit").and_then(|v| v.as_str()) {
                built["unit"] = json!(unit);
            }
        }
        "poll" => {
            let mut answers = str_list(parsed, "answers", 4);
            if answers.len() < 2 {
                answers = vec!["A".into(), "B".into()];
            }
            built["answers"] = Value::Array(answers.into_iter().map(Value::String).collect());
        }
        _ => {
            // Unknown → safe choice-like default
            built["type"] = json!("choice");
            built["answers"] = json!(["A", "B", "C", "D"]);
            built["solutions"] = json!([0]);
        }
    }

    built
}

/// Generate a single question for any platform type (13 kinds). Language: BCP-47-ish tag.
pub async fn generate_question(
    topic: &str,
    q_type: &str,
    language: &str,
    user_id: Option<i64>,
    db_pool: Option<PgPool>,
) -> Result<Value, String> {
    let shape_hint = shape_hint_for_type(q_type);

    let prompt = format!(
        r#"Write ONE quiz question of kind "{}" about: "{}". Language: {}. {}"#,
        q_type, topic, language, shape_hint
    );

    let system = "You are a quiz author. Produce a single high-quality quiz question. Output strict JSON only, no prose.";

    let raw = generate_text(GenerateTextOptions {
        system: Some(system.to_string()),
        prompt,
        json: true,
        max_tokens: Some(900),
        user_id,
        db_pool,
    })
    .await?;

    let parsed = ai_utils::parse_json(&raw)?;
    let built = map_llm_to_question(q_type, &parsed, language);

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
        max_tokens: Some((count as u32) * 160 + 400),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_all_thirteen_types() {
        let cases: &[(&str, Value)] = &[
            (
                "choice",
                json!({"question": "Q", "answers": ["a", "b", "c", "d"], "correctIndex": 1}),
            ),
            ("boolean", json!({"question": "Q", "answer": true})),
            (
                "multiple-select",
                json!({"question": "Q", "answers": ["a", "b", "c"], "correctIndexes": [0, 2]}),
            ),
            (
                "type-answer",
                json!({"question": "Q", "acceptedAnswers": ["Berlin", "berlin"]}),
            ),
            (
                "sentence-builder",
                json!({"question": "Q", "chunks": ["The", "cat", "sat"]}),
            ),
            (
                "sequencing",
                json!({"question": "Q", "items": [{"id": "1", "label": "First"}, {"id": "2", "label": "Second"}]}),
            ),
            (
                "mathematik",
                json!({"question": "Q", "correct": 42.0, "tolerance": 0.5, "decimals": 1}),
            ),
            (
                "wortarten",
                json!({
                    "question": "Q",
                    "sentence": "Der Hund bellt.",
                    "tokens": ["Der", "Hund", "bellt"],
                    "posSet": ["Artikel", "Nomen", "Verb"],
                    "solutions": [0, 1, 2]
                }),
            ),
            (
                "fill-blank",
                json!({
                    "question": "Q",
                    "segments": ["The ", " is blue."],
                    "slots": [{"options": ["sky", "grass"], "correctIndex": 0}]
                }),
            ),
            (
                "matching",
                json!({
                    "question": "Q",
                    "leftItems": [{"label": "DE", "options": ["yes", "no"], "correctIndex": 0}]
                }),
            ),
            (
                "drop-pin",
                json!({"question": "Q", "hotspots": [{"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}]}),
            ),
            (
                "slider",
                json!({"question": "Q", "min": 0, "max": 10, "correct": 7, "unit": "kg"}),
            ),
            (
                "poll",
                json!({"question": "Q", "answers": ["Great", "OK", "Meh"]}),
            ),
        ];

        assert_eq!(cases.len(), 13);
        for (ty, parsed) in cases {
            let built = map_llm_to_question(ty, parsed, "de");
            assert_eq!(
                built.get("type").and_then(|v| v.as_str()),
                Some(*ty),
                "type field for {ty}"
            );
            assert!(
                built.get("question").and_then(|v| v.as_str()).is_some(),
                "question for {ty}"
            );
        }

        // Type-specific shape smoke
        let fill = map_llm_to_question(
            "fill-blank",
            &json!({
                "question": "Q",
                "segments": ["a", "b"],
                "slots": [{"options": ["x", "y"], "correctIndex": 1}]
            }),
            "en",
        );
        assert_eq!(fill["slots"].as_array().unwrap().len(), 1);
        assert_eq!(fill["segments"].as_array().unwrap().len(), 2);

        let seq = map_llm_to_question(
            "sequencing",
            &json!({"question": "Q", "items": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]}),
            "en",
        );
        assert_eq!(seq["correctOrder"], json!(["a", "b"]));

        let pin = map_llm_to_question(
            "drop-pin",
            &json!({"question": "Q", "hotspots": [{"x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1}]}),
            "en",
        );
        assert_eq!(pin["media"]["type"], json!("image"));
        assert!(pin["hotspots"].as_array().unwrap().len() >= 1);
    }

    #[test]
    fn shape_hints_cover_all_types() {
        for ty in [
            "choice",
            "boolean",
            "slider",
            "poll",
            "multiple-select",
            "type-answer",
            "sentence-builder",
            "mathematik",
            "wortarten",
            "sequencing",
            "fill-blank",
            "matching",
            "drop-pin",
        ] {
            let h = shape_hint_for_type(ty);
            assert!(h.contains("JSON shape"), "{ty}");
        }
    }
}
