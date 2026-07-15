use super::*;

/// Shuffles chunks using Fisher-Yates, retrying up to 10 times
/// to ensure the result differs from the input order.
pub(crate) fn shuffle_chunks_with_guard(chunks: Vec<String>) -> Vec<String> {
    use rand::seq::SliceRandom;
    use rand::thread_rng;
    
    let is_equal = |a: &[String], b: &[String]| -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).all(|(x, y)| x == y)
    };
    
    let mut rng = thread_rng();
    let mut shuffled = chunks.clone();
    let mut attempts = 0;
    
    while attempts < 10 && is_equal(&shuffled, &chunks) {
        shuffled.shuffle(&mut rng);
        attempts += 1;
    }
    
    shuffled
}

/// Builds a SELECT_ANSWER payload. `question_start_at_server_ms` is passed
/// separately from `server_now_ms` (rather than always being "now") so this
/// doubles as a resync builder: `manager:adjustTimer` (pacing.rs) re-emits this
/// with a fresh `server_now_ms`/`answer_deadline_at_server_ms` but the SAME,
/// original `question_start_at_server_ms` — clients need the true start moment
/// to keep rendering an accurate elapsed/total, not one that resets every time
/// the host nudges the timer.
pub(crate) fn build_select_answer_data(
    question: &Question,
    total_players: i32,
    server_now_ms: i64,
    question_start_at_server_ms: i64,
    deadline_ms: i64,
    server_seq: Option<i32>,

    shuffled_chunks: Option<Vec<String>>,
) -> SelectAnswerData {
    SelectAnswerData {
        question: question.question.clone(),
        answers: question.answers.clone(),
        media: question.media.clone(),
        time: question.time,
        total_player: total_players,
        question_type: question
            .r#type
            .as_ref()
            .map(|t| question_type_wire(t).to_string()),
        min: question.min.map(|v| v as i32),
        max: question.max.map(|v| v as i32),
        step: question.step.map(|v| v as i32),
        unit: question.unit.clone(),
        shuffled_chunks,
        server_seq,
        server_now_ms: Some(server_now_ms),
        question_start_at_server_ms: Some(question_start_at_server_ms),
        answer_deadline_at_server_ms: Some(deadline_ms),
        submitted_by: question.submitted_by.clone(),
        sentence: question.sentence.clone(),
        tokens: question.tokens.clone(),
        pos_set: question.pos_set.clone(),
        disabled_tokens: question.disabled_tokens.clone(),
    }
}

pub(crate) fn build_finished_data(game: &Game, recap_json: Option<serde_json::Value>) -> FinishedData {
    FinishedData {
        subject: game.engine.quiz.subject.clone(),
        top: {
            let mut sorted = game.engine.players.clone();
            sorted.sort_by(|a, b| b.points.cmp(&a.points).then_with(|| a.username.cmp(&b.username)));
            sorted
        },
        rank: None,
        team_standings: None,
        recap: recap_json,
        auto_mode: Some(game.auto_mode),
        // W1-M3b: deliver the host-selected end-screen mode to clients.
        end_screen: game.selected_modes.end_screen,
    }
}

pub(crate) fn build_recap_and_questions(engine: &razzoozle_engine::state::GameState)
    -> (Option<serde_json::Value>, serde_json::Value) {
    let recap = engine.build_manager_recap();
    let recap_json = if recap.superlatives.is_empty() {
        None
    } else {
        serde_json::to_value(&recap).ok()
    };
    let questions_json =
        serde_json::to_value(&engine.questions_history).unwrap_or_else(|_| serde_json::json!([]));
    (recap_json, questions_json)
}