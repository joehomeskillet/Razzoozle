//! build_and_emit_config — loads all manager-visible data and emits manager:config

use super::super::HandlerCtx;
use super::plugins;
use crate::db;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::ScoringMode;
use socketioxide::extract::SocketRef;

/// Build ManagerConfig from database and registry, then emit to the given socket.
/// Called after successful auth AND after any quiz/config write operation.
pub async fn build_and_emit_config(socket: &SocketRef, ctx: &HandlerCtx) {
    let quizz = build_quizz_with_ids(ctx).await;
    let media = db::get_media_list(&ctx.db_pool).await;
    let results = db::get_results(&ctx.db_pool).await;
    let submissions = db::get_submissions(&ctx.db_pool).await;
    let theme_templates = db::get_themes(&ctx.db_pool).await;
    let achievements = db::get_achievements(&ctx.db_pool).await;
    // DISK read (spec_plugins.md ruling 2): config/plugins/index.json is the
    // source of truth; the installed_plugins DB table is never written by Node,
    // so db::get_plugins always returned [] — a live bug this fixes.
    let plugins = plugins::read_plugins_index();
    // Note: low_latency_config (6th element) is fetched but not currently used in ManagerConfig.
    // It will be consumed by deferred clock-sync sub-flag fix; callers ignore with _.
    let (team_mode, low_latency_enabled, join_locked, randomize_answers, scoring_mode, _low_latency_config) =
        db::get_game_config(&ctx.db_pool).await;

    let dev_mode_on = std::env::var("RAZZOOLE_DEV").as_deref() == Ok("1");

    let payload = razzoozle_protocol::manager::ManagerConfig {
        quizz: serde_json::Value::Array(quizz),
        results: serde_json::Value::Array(results),
        submissions: serde_json::json!(submissions),
        media: Some(serde_json::Value::Array(media)),
        theme_templates: Some(serde_json::Value::Array(theme_templates)),
        team_mode,
        low_latency_enabled,
        join_locked,
        randomize_answers,
        scoring_mode: scoring_mode.and_then(|s| {
            match s.as_str() {
                "speed" => Some(ScoringMode::Speed),
                "accuracy" => Some(ScoringMode::Accuracy),
                _ => None,
            }
        }),
        achievements: Some(serde_json::Value::Array(achievements)),
        dev_mode: Some(dev_mode_on),
        dev_api_key: if dev_mode_on {
            std::env::var("DEV_API_KEY").ok()
        } else {
            None
        },
        plugins: Some(plugins),
        observability: None,
    };

    socket.emit(constants::manager::CONFIG, &payload).ok();
}

/// Build QuizzMeta array from registry: {id, subject, archived, questionCount}
/// (NOT the full questions array — matches Node's getQuizzMeta behavior)
async fn build_quizz_with_ids(ctx: &HandlerCtx) -> Vec<serde_json::Value> {
    let registry = ctx.registry.read().await;
    let mut quiz_ids = registry.list_quiz_ids();
    quiz_ids.sort();
    drop(registry);

    let mut quizz = Vec::new();
    for id in quiz_ids {
        let registry = ctx.registry.read().await;
        if let Some(quiz) = registry.get_quiz_by_id(&id) {
            let question_count = quiz.questions.len();
            let quizz_obj = serde_json::json!({
                "id": id,
                "subject": quiz.subject,
                "archived": quiz.archived,
                "questionCount": question_count,
            });
            quizz.push(quizz_obj);
        }
    }

    quizz
}
