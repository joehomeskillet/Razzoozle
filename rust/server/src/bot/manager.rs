//! BotManager — per-question answer scheduler for sim-mode bots.
//! Ported from packages/socket/src/services/game/bot-manager.ts.

use crate::state::Game;
use razzoozle_engine::eval::SLIDER_TOLERANCE_FRACTION;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants::Bot;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::{Question, QuestionType};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use rand::Rng;

pub struct BotManager {
    pending: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    speed: Arc<Mutex<HashMap<String, f32>>>,
}

impl BotManager {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
            speed: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Assign a stable per-bot speed trait in [0, 1) for delay variation.
    pub fn add_bot_speed(&self, client_id: String) {
        let mut rng = rand::thread_rng();
        let trait_speed: f32 = rng.gen();
        self.speed.lock().unwrap().insert(client_id, trait_speed);
    }

    /// Schedule one answer per bot for the current question (fire-and-forget tasks).
    pub async fn schedule_answers(
        &self,
        game_id: String,
        bots: Vec<Player>,
        question: Question,
        game_ref: Arc<Mutex<Game>>,
        io: SocketIo,
    ) {
        self.cancel_pending(None).await;

        for bot in bots.into_iter().filter(|p| p.is_bot == Some(true)) {
            let delay_ms = self.compute_delay(&question, &bot.client_id);
            let (answer_key, answer_keys, answer_text) = pick_answer(&question);
            let client_id = bot.client_id.clone();
            let game_ref_task = game_ref.clone();
            let io_task = io.clone();
            let game_id_task = game_id.clone();

            let pending = Arc::clone(&self.pending);
            let client_id_cleanup = bot.client_id.clone();
            let handle = tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                submit_bot_answer(
                    game_ref_task,
                    io_task,
                    game_id_task,
                    client_id,
                    answer_key,
                    answer_keys,
                    answer_text,
                )
                .await;
                pending.lock().unwrap().remove(&client_id_cleanup);
            });

            self.pending
                .lock()
                .unwrap()
                .insert(bot.client_id, handle);
        }
    }

    /// Abort outstanding bot answer tasks. Idempotent — safe to call repeatedly.
    pub async fn cancel_pending(&self, client_id: Option<&str>) {
        let mut pending = self.pending.lock().unwrap();
        match client_id {
            Some(id) => {
                if let Some(handle) = pending.remove(id) {
                    handle.abort();
                }
            }
            None => {
                for (_, handle) in pending.drain() {
                    handle.abort();
                }
            }
        }
    }

    fn compute_delay(&self, question: &Question, client_id: &str) -> u64 {
        let cap = (question.time as f64 * 1000.0 * 0.85) as u64;
        let cap = cap.min(Bot::MAX_DELAY_MS);
        let upper = Bot::MIN_DELAY_MS.max(cap);
        let trait_speed = self
            .speed
            .lock()
            .unwrap()
            .get(client_id)
            .copied()
            .unwrap_or_else(|| rand::thread_rng().gen());
        let span = upper.saturating_sub(Bot::MIN_DELAY_MS) as f32;
        let delay = Bot::MIN_DELAY_MS as f32 + trait_speed * span;
        delay.round() as u64
    }
}

fn pick_answer(question: &Question) -> (Option<i32>, Option<Vec<i32>>, Option<String>) {
    match question.r#type.as_ref() {
        Some(QuestionType::Slider) => (Some(pick_slider(question)), None, None),
        Some(QuestionType::Poll) => (Some(pick_poll(question)), None, None),
        Some(QuestionType::MultipleSelect) => (None, Some(pick_multiple_select(question)), None),
        Some(QuestionType::TypeAnswer) => (None, None, Some(pick_type_answer(question))),
        Some(QuestionType::SentenceBuilder) => (None, None, Some(pick_sentence_builder(question))),
        _ => (Some(pick_choice(question)), None, None),
    }
}

fn pick_poll(question: &Question) -> i32 {
    let total = question.answers.as_ref().map(|a| a.len()).unwrap_or(0);
    if total == 0 {
        return 0;
    }
    rand::thread_rng().gen_range(0..total) as i32
}

fn pick_choice(question: &Question) -> i32 {
    let total = question.answers.as_ref().map(|a| a.len()).unwrap_or(0);
    if total == 0 {
        return 0;
    }
    let solutions = question.solutions.clone().unwrap_or_default();
    let want_correct = rand::thread_rng().gen::<f64>() < Bot::CORRECT_RATE;

    if want_correct && !solutions.is_empty() {
        let idx = rand::thread_rng().gen_range(0..solutions.len());
        return solutions[idx];
    }

    let wrong: Vec<i32> = (0..total as i32)
        .filter(|i| !solutions.contains(i))
        .collect();
    if wrong.is_empty() {
        return rand::thread_rng().gen_range(0..total) as i32;
    }
    wrong[rand::thread_rng().gen_range(0..wrong.len())]
}

fn pick_multiple_select(question: &Question) -> Vec<i32> {
    let total = question.answers.as_ref().map(|a| a.len()).unwrap_or(0);
    if total == 0 {
        return vec![0];
    }
    let solutions = question.solutions.clone().unwrap_or_default();
    let want_correct = rand::thread_rng().gen::<f64>() < Bot::CORRECT_RATE;

    if want_correct && !solutions.is_empty() {
        return solutions;
    }

    let wrong: Vec<i32> = (0..total as i32)
        .filter(|i| !solutions.contains(i))
        .collect();
    if wrong.is_empty() {
        let idx = rand::thread_rng().gen_range(0..total);
        return vec![idx as i32];
    }
    let pick = wrong[rand::thread_rng().gen_range(0..wrong.len())];
    vec![pick]
}

fn pick_slider(question: &Question) -> i32 {
    let min = question.min.unwrap_or(0.0);
    let max = question.max.unwrap_or(0.0);
    let correct = question.correct.unwrap_or(min);
    let range = (max - min).abs().max(1.0);
    let tolerance = (question.step.unwrap_or(0.0)).max(range * SLIDER_TOLERANCE_FRACTION);
    let want_correct = rand::thread_rng().gen::<f64>() < Bot::CORRECT_RATE;

    if want_correct {
        let jitter = (rand::thread_rng().gen::<f64>() * 2.0 - 1.0) * tolerance;
        let value = (correct + jitter).clamp(min, max);
        return value.round() as i32;
    }

    for _ in 0..8 {
        let value = (min + rand::thread_rng().gen::<f64>() * range).round() as i32;
        if ((value as f64) - correct).abs() > tolerance {
            return value;
        }
    }

    if correct - min > max - correct {
        min.round() as i32
    } else {
        max.round() as i32
    }
}

fn pick_type_answer(question: &Question) -> String {
    let accepted = question.accepted_answers.clone().unwrap_or_default();
    let want_correct = rand::thread_rng().gen::<f64>() < Bot::CORRECT_RATE;

    if want_correct && !accepted.is_empty() {
        let idx = rand::thread_rng().gen_range(0..accepted.len());
        return accepted[idx].clone();
    }

    format!("bot-guess-{}", rand::thread_rng().gen::<u32>())
}

fn pick_sentence_builder(question: &Question) -> String {
    let chunks = question.chunks.clone().unwrap_or_default();
    if chunks.is_empty() {
        return String::new();
    }
    let mut shuffled = chunks;
    let mut rng = rand::thread_rng();
    for i in (1..shuffled.len()).rev() {
        let j = rng.gen_range(0..=i);
        shuffled.swap(i, j);
    }
    shuffled.join(" ")
}

async fn submit_bot_answer(
    game_ref: Arc<Mutex<Game>>,
    io: SocketIo,
    game_id: String,
    client_id: String,
    answer_key: Option<i32>,
    answer_keys: Option<Vec<i32>>,
    answer_text: Option<String>,
) {
    let server_now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let record_result = {
        let mut game = game_ref.lock().unwrap();
        if game.engine.phase != GamePhase::SelectAnswer {
            return;
        }
        game.engine.set_clock_ms(server_now_ms);
        game.engine.record_answer(
            &client_id,
            answer_key,
            answer_keys,
            answer_text,
        )
    };

    if record_result.is_err() {
        return;
    }

    let answer_count = {
        let game = game_ref.lock().unwrap();
        game.engine.current_answers.len() as i32
    };
    io.to(game_id.clone())
        .emit(razzoozle_protocol::constants::game::PLAYER_ANSWER, &answer_count)
        .ok();

    let should_auto_advance = {
        let game = game_ref.lock().unwrap();
        if game.engine.phase != GamePhase::SelectAnswer {
            false
        } else {
            let total_player_count = game.players.len();
            let answered_count = game.engine.current_answers.len();
            total_player_count > 0 && answered_count >= total_player_count
        }
    };

    if should_auto_advance {
        let game = game_ref.lock().unwrap();
        if game.engine.phase == GamePhase::SelectAnswer {
            game.signal_abort();
        }
    }
}

impl Default for BotManager {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for BotManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BotManager").finish_non_exhaustive()
    }
}