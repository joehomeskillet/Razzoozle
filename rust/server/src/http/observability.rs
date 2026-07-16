use std::collections::HashMap;

use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    Json,
};
use razzoozle_protocol::constants::{
    ai, catalog, clock, display, game, manager, media, metrics, player, quizz, results,
    theme_revision, theme_template,
};
use serde::Serialize;
use subtle::ConstantTimeEq;

use super::{dev_api_key, is_dev_mode, json_error_response};

const S2C_HINTS: &[&str] = &[
    "data",
    "success",
    "error",
    "status",
    "result",
    "generated",
    "uploaded",
    "enhanced",
    "kicked",
    "unauthorized",
    "config",
    "health",
    "pong",
    "registered",
    "reconnected",
    "created",
    "leaderboard",
    "cooldown",
    "question",
    "players",
    "room",
    "join",
    "reset",
];

const JS_SAFE_INTEGER_MIN: i64 = -9_007_199_254_740_991;
const JS_SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;

#[derive(Debug, Serialize)]
pub struct EventsResponse {
    events: Vec<EventCatalogEntry>,
}

#[derive(Debug, Serialize)]
struct EventCatalogEntry {
    name: &'static str,
    role: &'static str,
    key: &'static str,
    direction: &'static str,
}

fn direction_for(key: &str) -> &'static str {
    let lower = key.to_ascii_lowercase();
    if S2C_HINTS.iter().any(|hint| lower.contains(hint)) {
        "s2c"
    } else {
        "c2s"
    }
}

macro_rules! push_event_group {
    ($events:ident, $role:literal, $module:ident, [$($key:ident),* $(,)?]) => {
        $(
            let key = stringify!($key);
            $events.push(EventCatalogEntry {
                name: $module::$key,
                role: $role,
                key,
                direction: direction_for(key),
            });
        )*
    };
}

fn build_event_catalog() -> Vec<EventCatalogEntry> {
    let mut events = Vec::with_capacity(152);
    push_event_group!(
        events,
        "GAME",
        game,
        [
            STATUS,
            SUCCESS_ROOM,
            SUCCESS_JOIN,
            TOTAL_PLAYERS,
            ERROR_MESSAGE,
            START_COOLDOWN,
            COOLDOWN,
            RESET,
            UPDATE_QUESTION,
            PLAYER_ANSWER,
            CREATE,
        ]
    );
    push_event_group!(
        events,
        "PLAYER",
        player,
        [
            SUCCESS_RECONNECT,
            UPDATE_LEADERBOARD,
            JOIN,
            LOGIN,
            RECONNECT,
            LEAVE,
            SELECTED_ANSWER,
            ANSWER_ACK,
            SET_AVATAR,
            SELECT_TEAM,
        ]
    );
    push_event_group!(events, "CLOCK", clock, [PING, PONG]);
    push_event_group!(events, "METRICS", metrics, [REPORT, SUBSCRIBE, HEALTH]);
    push_event_group!(
        events,
        "MANAGER",
        manager,
        [
            SUCCESS_RECONNECT,
            CONFIG,
            GAME_CREATED,
            STATUS_UPDATE,
            NEW_PLAYER,
            REMOVE_PLAYER,
            ERROR_MESSAGE,
            PLAYER_KICKED,
            AUTH,
            RECONNECT,
            LEAVE,
            KICK_PLAYER,
            START_GAME,
            SET_AUTO,
            ADD_BOTS,
            ABORT_QUIZ,
            NEXT_QUESTION,
            SHOW_LEADERBOARD,
            GET_CONFIG,
            LOGOUT,
            UNAUTHORIZED,
            GET_THEME,
            THEME,
            SET_THEME,
            SET_THEME_SUCCESS,
            UPLOAD_BACKGROUND,
            BACKGROUND_UPLOADED,
            UPLOAD_SOUND,
            SOUND_UPLOADED,
            THEME_ERROR,
            SET_SKELETON_ASSET,
            SET_SKELETON_ASSET_SUCCESS,
            RESET_SKELETON,
            RESET_SKELETON_SUCCESS,
            SUBMIT_QUESTION,
            LIST_SUBMISSIONS,
            APPROVE_SUBMISSION,
            REJECT_SUBMISSION,
            EDIT_SUBMISSION,
            SUBMISSIONS_DATA,
            SUBMISSION_ERROR,
            SUBMIT_SUCCESS,
            GENERATE_IMAGE,
            IMAGE_GENERATED,
            IMAGE_ERROR,
            EDIT_IMAGE,
            SUBMIT_UPLOAD_IMAGE,
            UPLOAD_IMAGE_SUCCESS,
            ENHANCE_PROMPT,
            PROMPT_ENHANCED,
            PLAYER_RECONNECTED,
            PAUSE_GAME,
            RESUME_GAME,
            SET_GAME_CONFIG,
            SET_ACHIEVEMENTS_CONFIG,
            SKIP_QUESTION,
            ADJUST_TIMER,
            REVEAL_ANSWER,
            LIST_GAMES,
            GAMES_DATA,
            END_GAME,
            PLUGIN_CONFIG,
            PLUGIN_INSTALL,
            PLUGIN_REMOVE,
            PLUGIN_SET_CONFIG,
        ]
    );
    push_event_group!(
        events,
        "QUIZZ",
        quizz,
        [
            GET,
            DATA,
            SAVE,
            SAVE_SUCCESS,
            UPDATE,
            UPDATE_SUCCESS,
            DELETE,
            DUPLICATE,
            SET_ARCHIVED,
            ERROR,
        ]
    );
    push_event_group!(
        events,
        "THEME_TEMPLATE",
        theme_template,
        [LIST, DATA, SAVE, SAVE_SUCCESS, DELETE, ERROR]
    );
    push_event_group!(
        events,
        "CATALOG",
        catalog,
        [LIST, DATA, ADD, ADD_SUCCESS, UPDATE, DELETE, ERROR]
    );
    push_event_group!(
        events,
        "MEDIA",
        media,
        [LIST, DATA, UPLOAD, UPLOAD_SUCCESS, DELETE, ERROR]
    );
    push_event_group!(
        events,
        "AI",
        ai,
        [
            GET_SETTINGS,
            SETTINGS,
            SET_SETTINGS,
            SET_SETTINGS_SUCCESS,
            SET_KEY,
            TEST_PROVIDER,
            TEST_RESULT,
            GENERATE_QUESTION,
            QUESTION_GENERATED,
            GENERATE_DISTRACTORS,
            DISTRACTORS_GENERATED,
            GENERATE_QUIZ,
            QUIZ_GENERATED,
            ERROR,
        ]
    );
    push_event_group!(
        events,
        "RESULTS",
        results,
        [GET, DATA, DELETE, GET_SHARED, SHARED_DATA]
    );
    push_event_group!(
        events,
        "DISPLAY",
        display,
        [
            REGISTER,
            REGISTERED,
            PAIR,
            PAIR_SUCCESS,
            PAIR_ERROR,
            DISCONNECT,
            PING,
            STATUS,
        ]
    );
    push_event_group!(
        events,
        "THEME_REVISION",
        theme_revision,
        [
            LIST_REVISIONS,
            DATA,
            RESTORE_REVISION,
            RESTORE_SUCCESS,
            ERROR,
        ]
    );
    events
}

#[derive(Debug, Serialize)]
pub struct ClientEventSchema {
    #[serde(rename = "$schema")]
    schema: &'static str,
    #[serde(rename = "oneOf")]
    one_of: [SchemaVariant; 4],
}

#[derive(Debug, Serialize)]
struct SchemaVariant {
    #[serde(rename = "type")]
    kind: &'static str,
    properties: ClientEventProperties,
    required: &'static [&'static str],
    #[serde(rename = "additionalProperties")]
    additional_properties: bool,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ClientEventProperties {
    ClientError(ClientErrorProperties),
    JoinFailure(JoinFailureProperties),
    SocketReconnect(SocketReconnectProperties),
    AnswerLatency(AnswerLatencyProperties),
}

#[derive(Debug, Serialize)]
struct ClientErrorProperties {
    #[serde(rename = "type")]
    kind: LiteralStringSchema,
    #[serde(rename = "clientId")]
    client_id: StringSchema,
    message: StringSchema,
    context: StringSchema,
    ts: NumberSchema,
}

#[derive(Debug, Serialize)]
struct JoinFailureProperties {
    #[serde(rename = "type")]
    kind: LiteralStringSchema,
    #[serde(rename = "clientId")]
    client_id: StringSchema,
    pin: StringSchema,
    reason: StringSchema,
    ts: NumberSchema,
}

#[derive(Debug, Serialize)]
struct SocketReconnectProperties {
    #[serde(rename = "type")]
    kind: LiteralStringSchema,
    #[serde(rename = "clientId")]
    client_id: StringSchema,
    attempts: NumberSchema,
    ts: NumberSchema,
}

#[derive(Debug, Serialize)]
struct AnswerLatencyProperties {
    #[serde(rename = "type")]
    kind: LiteralStringSchema,
    #[serde(rename = "clientId")]
    client_id: StringSchema,
    #[serde(rename = "latencyMs")]
    latency_ms: NumberSchema,
    ts: NumberSchema,
}

#[derive(Debug, Serialize)]
struct LiteralStringSchema {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "const")]
    value: &'static str,
}

#[derive(Debug, Serialize)]
struct StringSchema {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "minLength", skip_serializing_if = "Option::is_none")]
    min_length: Option<u64>,
    #[serde(rename = "maxLength", skip_serializing_if = "Option::is_none")]
    max_length: Option<u64>,
}

#[derive(Debug, Serialize)]
struct NumberSchema {
    #[serde(rename = "type")]
    kind: &'static str,
    minimum: i64,
    maximum: i64,
}

fn literal(value: &'static str) -> LiteralStringSchema {
    LiteralStringSchema {
        kind: "string",
        value,
    }
}

fn string(min_length: Option<u64>, max_length: u64) -> StringSchema {
    StringSchema {
        kind: "string",
        min_length,
        max_length: Some(max_length),
    }
}

fn integer(minimum: i64, maximum: i64) -> NumberSchema {
    NumberSchema {
        kind: "integer",
        minimum,
        maximum,
    }
}

fn timestamp() -> NumberSchema {
    integer(JS_SAFE_INTEGER_MIN, JS_SAFE_INTEGER_MAX)
}

fn schema_variant(
    properties: ClientEventProperties,
    required: &'static [&'static str],
) -> SchemaVariant {
    SchemaVariant {
        kind: "object",
        properties,
        required,
        additional_properties: false,
    }
}

fn client_event_schema() -> ClientEventSchema {
    ClientEventSchema {
        schema: "https://json-schema.org/draft/2020-12/schema",
        one_of: [
            schema_variant(
                ClientEventProperties::ClientError(ClientErrorProperties {
                    kind: literal("client-error"),
                    client_id: string(Some(1), 200),
                    message: string(None, 2000),
                    context: string(None, 2000),
                    ts: timestamp(),
                }),
                &["type", "clientId", "message"],
            ),
            schema_variant(
                ClientEventProperties::JoinFailure(JoinFailureProperties {
                    kind: literal("join-failure"),
                    client_id: string(Some(1), 200),
                    pin: string(None, 200),
                    reason: string(None, 200),
                    ts: timestamp(),
                }),
                &["type", "clientId", "reason"],
            ),
            schema_variant(
                ClientEventProperties::SocketReconnect(SocketReconnectProperties {
                    kind: literal("socket-reconnect"),
                    client_id: string(Some(1), 200),
                    attempts: integer(0, 100_000),
                    ts: timestamp(),
                }),
                &["type", "clientId", "attempts"],
            ),
            schema_variant(
                ClientEventProperties::AnswerLatency(AnswerLatencyProperties {
                    kind: literal("answer-latency"),
                    client_id: string(Some(1), 200),
                    latency_ms: NumberSchema {
                        kind: "number",
                        minimum: 0,
                        maximum: 600_000,
                    },
                    ts: timestamp(),
                }),
                &["type", "clientId", "latencyMs"],
            ),
        ],
    }
}

#[derive(Debug, PartialEq, Eq)]
enum DevAuthorization {
    Authorized,
    NotFound,
    Unauthorized,
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    bool::from(left.ct_eq(right))
}

fn authorize_dev_request(
    dev_mode: bool,
    expected: Option<&str>,
    header_token: Option<&str>,
    query_token: Option<&str>,
) -> DevAuthorization {
    if !dev_mode {
        return DevAuthorization::NotFound;
    }

    let Some(expected) = expected.filter(|key| !key.is_empty()) else {
        return DevAuthorization::Authorized;
    };
    let presented = header_token.or(query_token).unwrap_or("");
    if constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        DevAuthorization::Authorized
    } else {
        DevAuthorization::Unauthorized
    }
}

fn authorize_observability(
    headers: &HeaderMap,
    query_token: Option<&str>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let key = dev_api_key();

    // Check Authorization: Bearer header first
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                match authorize_dev_request(is_dev_mode(), key.as_deref(), Some(token), None) {
                    DevAuthorization::Authorized => return Ok(()),
                    DevAuthorization::NotFound => {
                        return Err(json_error_response(StatusCode::NOT_FOUND, "not found"))
                    }
                    DevAuthorization::Unauthorized => {
                        return Err(json_error_response(
                            StatusCode::UNAUTHORIZED,
                            "unauthorized",
                        ))
                    }
                }
            }
        }
    }

    // Fallback to X-Manager-Token header and query token
    let header_token = headers
        .get("x-manager-token")
        .map(|value| value.to_str().unwrap_or(""));

    match authorize_dev_request(is_dev_mode(), key.as_deref(), header_token, query_token) {
        DevAuthorization::Authorized => Ok(()),
        DevAuthorization::NotFound => Err(json_error_response(StatusCode::NOT_FOUND, "not found")),
        DevAuthorization::Unauthorized => Err(json_error_response(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
        )),
    }
}
pub async fn handle_observability_events(
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<EventsResponse>, (StatusCode, Json<serde_json::Value>)> {
    authorize_observability(&headers, params.get("token").map(String::as_str))?;
    Ok(Json(EventsResponse {
        events: build_event_catalog(),
    }))
}

pub async fn handle_observability_schema(
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ClientEventSchema>, (StatusCode, Json<serde_json::Value>)> {
    authorize_observability(&headers, params.get("token").map(String::as_str))?;
    Ok(Json(client_event_schema()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_catalog_matches_node_order_values_and_directions() {
        let catalog = build_event_catalog();
        let actual = catalog
            .iter()
            .map(|event| {
                format!(
                    "{}:{}={}:{}",
                    event.role, event.key, event.name, event.direction
                )
            })
            .collect::<Vec<_>>()
            .join("|");

        assert_eq!(catalog.len(), 152);
        assert_eq!(
            actual,
            concat!(
                "GAME:STATUS=game:status:s2c|GAME:SUCCESS_ROOM=game:successRoom:s2c|GAME:SUCCESS_JOIN=game:successJoin:s2c|GAME:TOTAL_PLAYERS=game:totalPlayers:s2c|GAME:ERROR_MESSAGE=game:errorMessage:s2c|GAME:START_COOLDOWN=game:startCooldown:s2c|GAME:COOLDOWN=game:cooldown:s2c|GAME:RESET=game:reset:s2c|GAME:UPDATE_QUESTION=game:updateQuestion:s2c|GAME:PLAYER_ANSWER=game:playerAnswer:c2s|GAME:CREATE=game:create:c2s|",
                "PLAYER:SUCCESS_RECONNECT=player:successReconnect:s2c|PLAYER:UPDATE_LEADERBOARD=player:updateLeaderboard:s2c|PLAYER:JOIN=player:join:s2c|PLAYER:LOGIN=player:login:c2s|PLAYER:RECONNECT=player:reconnect:c2s|PLAYER:LEAVE=player:leave:c2s|PLAYER:SELECTED_ANSWER=player:selectedAnswer:c2s|PLAYER:ANSWER_ACK=player:answerAck:c2s|PLAYER:SET_AVATAR=player:setAvatar:c2s|PLAYER:SELECT_TEAM=player:selectTeam:c2s|",
                "CLOCK:PING=clock:ping:c2s|CLOCK:PONG=clock:pong:s2c|",
                "METRICS:REPORT=metrics:report:c2s|METRICS:SUBSCRIBE=metrics:subscribe:c2s|METRICS:HEALTH=metrics:health:s2c|",
                "MANAGER:SUCCESS_RECONNECT=manager:successReconnect:s2c|MANAGER:CONFIG=manager:config:s2c|MANAGER:GAME_CREATED=manager:gameCreated:s2c|MANAGER:STATUS_UPDATE=manager:statusUpdate:s2c|MANAGER:NEW_PLAYER=manager:newPlayer:c2s|MANAGER:REMOVE_PLAYER=manager:removePlayer:c2s|MANAGER:ERROR_MESSAGE=manager:errorMessage:s2c|MANAGER:PLAYER_KICKED=manager:playerKicked:s2c|MANAGER:AUTH=manager:auth:c2s|MANAGER:RECONNECT=manager:reconnect:c2s|MANAGER:LEAVE=manager:leave:c2s|MANAGER:KICK_PLAYER=manager:kickPlayer:c2s|MANAGER:START_GAME=manager:startGame:c2s|MANAGER:SET_AUTO=manager:setAuto:c2s|MANAGER:ADD_BOTS=manager:addBots:c2s|MANAGER:ABORT_QUIZ=manager:abortQuiz:c2s|MANAGER:NEXT_QUESTION=manager:nextQuestion:s2c|MANAGER:SHOW_LEADERBOARD=manager:showLeaderboard:s2c|MANAGER:GET_CONFIG=manager:getConfig:s2c|MANAGER:LOGOUT=manager:logout:c2s|MANAGER:UNAUTHORIZED=manager:unauthorized:s2c|MANAGER:GET_THEME=manager:getTheme:c2s|MANAGER:THEME=manager:theme:c2s|MANAGER:SET_THEME=manager:setTheme:c2s|MANAGER:SET_THEME_SUCCESS=manager:setThemeSuccess:s2c|MANAGER:UPLOAD_BACKGROUND=manager:uploadBackground:c2s|MANAGER:BACKGROUND_UPLOADED=manager:backgroundUploaded:s2c|MANAGER:UPLOAD_SOUND=manager:uploadSound:c2s|MANAGER:SOUND_UPLOADED=manager:soundUploaded:s2c|MANAGER:THEME_ERROR=manager:themeError:s2c|MANAGER:SET_SKELETON_ASSET=manager:setSkeletonAsset:c2s|MANAGER:SET_SKELETON_ASSET_SUCCESS=manager:setSkeletonAssetSuccess:s2c|MANAGER:RESET_SKELETON=manager:resetSkeleton:s2c|MANAGER:RESET_SKELETON_SUCCESS=manager:resetSkeletonSuccess:s2c|MANAGER:SUBMIT_QUESTION=manager:submitQuestion:s2c|MANAGER:LIST_SUBMISSIONS=manager:listSubmissions:c2s|MANAGER:APPROVE_SUBMISSION=manager:approveSubmission:c2s|MANAGER:REJECT_SUBMISSION=manager:rejectSubmission:c2s|MANAGER:EDIT_SUBMISSION=manager:editSubmission:c2s|MANAGER:SUBMISSIONS_DATA=manager:submissionsData:s2c|MANAGER:SUBMISSION_ERROR=manager:submissionError:s2c|MANAGER:SUBMIT_SUCCESS=manager:submitSuccess:s2c|MANAGER:GENERATE_IMAGE=manager:generateImage:c2s|MANAGER:IMAGE_GENERATED=manager:imageGenerated:s2c|MANAGER:IMAGE_ERROR=manager:imageError:s2c|MANAGER:EDIT_IMAGE=manager:editImage:c2s|MANAGER:SUBMIT_UPLOAD_IMAGE=manager:submitUploadImage:c2s|MANAGER:UPLOAD_IMAGE_SUCCESS=manager:uploadImageSuccess:s2c|MANAGER:ENHANCE_PROMPT=manager:enhancePrompt:c2s|MANAGER:PROMPT_ENHANCED=manager:promptEnhanced:s2c|MANAGER:PLAYER_RECONNECTED=manager:playerReconnected:s2c|MANAGER:PAUSE_GAME=manager:pauseGame:c2s|MANAGER:RESUME_GAME=manager:resumeGame:c2s|MANAGER:SET_GAME_CONFIG=manager:setGameConfig:s2c|MANAGER:SET_ACHIEVEMENTS_CONFIG=manager:setAchievementsConfig:s2c|MANAGER:SKIP_QUESTION=manager:skipQuestion:s2c|MANAGER:ADJUST_TIMER=manager:adjustTimer:c2s|MANAGER:REVEAL_ANSWER=manager:revealAnswer:c2s|MANAGER:LIST_GAMES=manager:listGames:c2s|MANAGER:GAMES_DATA=manager:gamesData:s2c|MANAGER:END_GAME=manager:endGame:c2s|MANAGER:PLUGIN_CONFIG=manager:pluginConfig:s2c|MANAGER:PLUGIN_INSTALL=manager:pluginInstall:c2s|MANAGER:PLUGIN_REMOVE=manager:pluginRemove:c2s|MANAGER:PLUGIN_SET_CONFIG=manager:pluginSetConfig:s2c|",
                "QUIZZ:GET=quizz:get:c2s|QUIZZ:DATA=quizz:data:s2c|QUIZZ:SAVE=quizz:save:c2s|QUIZZ:SAVE_SUCCESS=quizz:saveSuccess:s2c|QUIZZ:UPDATE=quizz:update:c2s|QUIZZ:UPDATE_SUCCESS=quizz:updateSuccess:s2c|QUIZZ:DELETE=quizz:delete:c2s|QUIZZ:DUPLICATE=quizz:duplicate:c2s|QUIZZ:SET_ARCHIVED=quizz:setArchived:c2s|QUIZZ:ERROR=quizz:error:s2c|",
                "THEME_TEMPLATE:LIST=themeTemplate:list:c2s|THEME_TEMPLATE:DATA=themeTemplate:data:s2c|THEME_TEMPLATE:SAVE=themeTemplate:save:c2s|THEME_TEMPLATE:SAVE_SUCCESS=themeTemplate:saveSuccess:s2c|THEME_TEMPLATE:DELETE=themeTemplate:delete:c2s|THEME_TEMPLATE:ERROR=themeTemplate:error:s2c|",
                "CATALOG:LIST=catalog:list:c2s|CATALOG:DATA=catalog:data:s2c|CATALOG:ADD=catalog:add:c2s|CATALOG:ADD_SUCCESS=catalog:addSuccess:s2c|CATALOG:UPDATE=catalog:update:c2s|CATALOG:DELETE=catalog:delete:c2s|CATALOG:ERROR=catalog:error:s2c|",
                "MEDIA:LIST=media:list:c2s|MEDIA:DATA=media:data:s2c|MEDIA:UPLOAD=media:upload:c2s|MEDIA:UPLOAD_SUCCESS=media:uploadSuccess:s2c|MEDIA:DELETE=media:delete:c2s|MEDIA:ERROR=media:error:s2c|",
                "AI:GET_SETTINGS=ai:getSettings:c2s|AI:SETTINGS=ai:settings:c2s|AI:SET_SETTINGS=ai:setSettings:c2s|AI:SET_SETTINGS_SUCCESS=ai:setSettingsSuccess:s2c|AI:SET_KEY=ai:setKey:c2s|AI:TEST_PROVIDER=ai:testProvider:c2s|AI:TEST_RESULT=ai:testResult:s2c|AI:GENERATE_QUESTION=ai:generateQuestion:s2c|AI:QUESTION_GENERATED=ai:questionGenerated:s2c|AI:GENERATE_DISTRACTORS=ai:generateDistractors:c2s|AI:DISTRACTORS_GENERATED=ai:distractorsGenerated:s2c|AI:GENERATE_QUIZ=ai:generateQuiz:c2s|AI:QUIZ_GENERATED=ai:quizGenerated:s2c|AI:ERROR=ai:error:s2c|",
                "RESULTS:GET=results:get:c2s|RESULTS:DATA=results:data:s2c|RESULTS:DELETE=results:delete:c2s|RESULTS:GET_SHARED=results:getShared:c2s|RESULTS:SHARED_DATA=results:sharedData:s2c|",
                "DISPLAY:REGISTER=display:register:c2s|DISPLAY:REGISTERED=display:registered:s2c|DISPLAY:PAIR=display:pair:c2s|DISPLAY:PAIR_SUCCESS=display:pairSuccess:s2c|DISPLAY:PAIR_ERROR=display:pairError:s2c|DISPLAY:DISCONNECT=display:disconnect:c2s|DISPLAY:PING=display:ping:c2s|DISPLAY:STATUS=display:status:s2c|",
                "THEME_REVISION:LIST_REVISIONS=themeRevision:list:c2s|THEME_REVISION:DATA=themeRevision:data:s2c|THEME_REVISION:RESTORE_REVISION=themeRevision:restore:c2s|THEME_REVISION:RESTORE_SUCCESS=themeRevision:restoreSuccess:s2c|THEME_REVISION:ERROR=themeRevision:error:s2c"
            )
        );
        assert_eq!(
            serde_json::to_string(&catalog[0]).unwrap(),
            r#"{"name":"game:status","role":"GAME","key":"STATUS","direction":"s2c"}"#
        );
    }

    #[test]
    fn client_event_schema_matches_zod_4_4_3_output_exactly() {
        assert_eq!(
            serde_json::to_string(&client_event_schema()).unwrap(),
            concat!(
                r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":["#,
                r#"{"type":"object","properties":{"type":{"type":"string","const":"client-error"},"clientId":{"type":"string","minLength":1,"maxLength":200},"message":{"type":"string","maxLength":2000},"context":{"type":"string","maxLength":2000},"ts":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}},"required":["type","clientId","message"],"additionalProperties":false},"#,
                r#"{"type":"object","properties":{"type":{"type":"string","const":"join-failure"},"clientId":{"type":"string","minLength":1,"maxLength":200},"pin":{"type":"string","maxLength":200},"reason":{"type":"string","maxLength":200},"ts":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}},"required":["type","clientId","reason"],"additionalProperties":false},"#,
                r#"{"type":"object","properties":{"type":{"type":"string","const":"socket-reconnect"},"clientId":{"type":"string","minLength":1,"maxLength":200},"attempts":{"type":"integer","minimum":0,"maximum":100000},"ts":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}},"required":["type","clientId","attempts"],"additionalProperties":false},"#,
                r#"{"type":"object","properties":{"type":{"type":"string","const":"answer-latency"},"clientId":{"type":"string","minLength":1,"maxLength":200},"latencyMs":{"type":"number","minimum":0,"maximum":600000},"ts":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}},"required":["type","clientId","latencyMs"],"additionalProperties":false}"#,
                "]}"
            )
        );
    }

    #[test]
    fn authorization_hides_route_when_dev_mode_is_off() {
        assert_eq!(
            authorize_dev_request(false, Some("key"), Some("key"), None),
            DevAuthorization::NotFound
        );
    }

    #[test]
    fn authorization_is_open_when_key_is_unset() {
        assert_eq!(
            authorize_dev_request(true, None, None, None),
            DevAuthorization::Authorized
        );
    }

    #[test]
    fn authorization_is_open_when_key_is_empty() {
        assert_eq!(
            authorize_dev_request(true, Some(""), None, None),
            DevAuthorization::Authorized
        );
    }

    #[test]
    fn authorization_rejects_missing_or_wrong_configured_token() {
        assert_eq!(
            authorize_dev_request(true, Some("secret"), None, None),
            DevAuthorization::Unauthorized
        );
        assert_eq!(
            authorize_dev_request(true, Some("secret"), Some("wrong"), None),
            DevAuthorization::Unauthorized
        );
        assert_eq!(
            authorize_dev_request(true, Some("secret"), Some("secrex"), None),
            DevAuthorization::Unauthorized
        );
    }

    #[test]
    fn constant_time_comparison_preserves_explicit_length_check() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secrex"));
        assert!(!constant_time_eq(b"secret", b"short"));
    }

    #[test]
    fn authorization_accepts_matching_header() {
        assert_eq!(
            authorize_dev_request(true, Some("secret"), Some("secret"), None),
            DevAuthorization::Authorized
        );
    }

    #[test]
    fn authorization_accepts_matching_query_token() {
        assert_eq!(
            authorize_dev_request(true, Some("secret"), None, Some("secret")),
            DevAuthorization::Authorized
        );
    }

    #[test]
    fn wrong_header_overrides_matching_query_token() {
        assert_eq!(
            authorize_dev_request(true, Some("secret"), Some("wrong"), Some("secret")),
            DevAuthorization::Unauthorized
        );
        assert_eq!(
            authorize_dev_request(true, Some("secret"), Some(""), Some("secret")),
            DevAuthorization::Unauthorized
        );
    }
}
