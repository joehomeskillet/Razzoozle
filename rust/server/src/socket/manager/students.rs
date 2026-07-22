//! STUDENT bulk handlers — active status, delete, assign, remove (WP-F1)
//! + batch class PIN fetch (WP-F8)
//!
//! class:setStudentActive — set active on one student
//! class:bulkSetStudentActive — bulk activate/deactivate
//! class:bulkDeleteStudent — bulk delete students
//! class:bulkAssignStudent — bulk enroll into a class
//! class:bulkRemoveStudent — bulk unenroll from a class
//! class:getPins — batch PIN fetch for one class (unicast to requester)
//!
//! All ops are owner-scoped (student.owner_id or membership in an owned class),
//! max 200 IDs, deduped. Failed / unauthorized IDs always report reason `"not_found"`.

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use serde::Deserialize;
use socketioxide::extract::{Data, SocketRef};

/// Max ids accepted per student bulk op (matches classes/users/results bulk cap).
const BULK_MAX_IDS: usize = db::classes::BULK_MAX_IDS;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetPinsPayload {
    class_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetStudentActivePayload {
    student_id: i64,
    active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkSetStudentActivePayload {
    student_ids: Vec<i64>,
    active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkDeleteStudentPayload {
    student_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkAssignStudentPayload {
    student_ids: Vec<i64>,
    class_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkRemoveStudentPayload {
    student_ids: Vec<i64>,
    class_id: i64,
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_student_active(socket, ctx.clone());
    register_bulk_set_student_active(socket, ctx.clone());
    register_bulk_delete_student(socket, ctx.clone());
    register_bulk_assign_student(socket, ctx.clone());
    register_bulk_remove_student(socket, ctx.clone());
    register_get_pins(socket, ctx);
}

/// Re-emit `class:allStudentsData` so the manager list reflects the mutation.
async fn emit_student_list_refresh(socket: &SocketRef, ctx: &HandlerCtx, me: Option<i64>) {
    match db::list_all_students(&ctx.db_pool, me).await {
        Ok(students) => {
            socket
                .emit(
                    constants::class::ALL_STUDENTS_DATA,
                    &serde_json::json!({ "students": students }),
                )
                .ok();
        }
        Err(e) => {
            tracing::warn!("student list refresh failed: {}", e);
        }
    }
}

fn me_from_user(user: &crate::db::users::AuthUser) -> Option<i64> {
    if user.role == "admin" {
        None
    } else {
        Some(user.user_id)
    }
}

fn register_set_student_active(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::SET_STUDENT_ACTIVE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<SetStudentActivePayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if payload.student_id <= 0 {
                    socket
                        .emit(constants::class::ERROR, "errors:class.invalidStudentId")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::set_student_active(
                    &ctx.db_pool,
                    payload.student_id,
                    payload.active,
                    me,
                )
                .await
                {
                    Ok(0) => {
                        // No ownership leak: treat missing/unauthorized as unauthorized ack.
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        socket
                            .emit(
                                constants::class::STUDENT_ACTIVE_SET,
                                &serde_json::json!({
                                    "studentId": payload.student_id,
                                    "active": payload.active,
                                }),
                            )
                            .ok();
                        emit_student_list_refresh(&socket, &ctx, me).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:setStudentActive failed: student_id={} actor_user_id={} error={}",
                            payload.student_id,
                            user.user_id,
                            e
                        );
                        socket
                            .emit(constants::class::ERROR, "errors:class.updateStudentFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_bulk_set_student_active(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::BULK_SET_STUDENT_ACTIVE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<BulkSetStudentActivePayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if payload.student_ids.is_empty() {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkEmpty")
                        .ok();
                    return;
                }
                if payload.student_ids.len() > BULK_MAX_IDS {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkTooMany")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::bulk_set_student_active(
                    &ctx.db_pool,
                    payload.student_ids,
                    payload.active,
                    me,
                    BULK_MAX_IDS,
                )
                .await
                {
                    Ok(outcome) => {
                        socket
                            .emit(constants::class::BULK_STUDENT_ACTIVE_SET, &outcome)
                            .ok();
                        emit_student_list_refresh(&socket, &ctx, me).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:bulkSetStudentActive failed: actor_user_id={} error={}",
                            user.user_id,
                            e
                        );
                        socket
                            .emit(constants::class::ERROR, "errors:class.updateStudentFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_bulk_delete_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::BULK_DELETE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<BulkDeleteStudentPayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if payload.student_ids.is_empty() {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkEmpty")
                        .ok();
                    return;
                }
                if payload.student_ids.len() > BULK_MAX_IDS {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkTooMany")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::bulk_delete_students(
                    &ctx.db_pool,
                    payload.student_ids,
                    me,
                    BULK_MAX_IDS,
                )
                .await
                {
                    Ok(outcome) => {
                        tracing::info!(
                            "class:bulkDeleteStudent: actor_user_id={} actor_role={} succeeded={} failed={}",
                            user.user_id,
                            user.role,
                            outcome.succeeded.len(),
                            outcome.failed.len()
                        );
                        socket
                            .emit(constants::class::BULK_STUDENT_DELETED, &outcome)
                            .ok();
                        emit_student_list_refresh(&socket, &ctx, me).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:bulkDeleteStudent failed: actor_user_id={} error={}",
                            user.user_id,
                            e
                        );
                        socket
                            .emit(constants::class::ERROR, "errors:class.removeStudentFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_bulk_assign_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::BULK_ASSIGN_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<BulkAssignStudentPayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if payload.class_id <= 0 {
                    socket
                        .emit(constants::class::ERROR, "errors:class.invalidClassId")
                        .ok();
                    return;
                }
                if payload.student_ids.is_empty() {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkEmpty")
                        .ok();
                    return;
                }
                if payload.student_ids.len() > BULK_MAX_IDS {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkTooMany")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::bulk_assign_students(
                    &ctx.db_pool,
                    payload.student_ids,
                    payload.class_id,
                    me,
                    BULK_MAX_IDS,
                )
                .await
                {
                    Ok(outcome) => {
                        socket
                            .emit(constants::class::BULK_STUDENT_ASSIGNED, &outcome)
                            .ok();
                        emit_student_list_refresh(&socket, &ctx, me).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:bulkAssignStudent failed: actor_user_id={} class_id={} error={}",
                            user.user_id,
                            payload.class_id,
                            e
                        );
                        socket
                            .emit(constants::class::ERROR, "errors:class.moveStudentFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_bulk_remove_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::BULK_REMOVE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<BulkRemoveStudentPayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                if payload.class_id <= 0 {
                    socket
                        .emit(constants::class::ERROR, "errors:class.invalidClassId")
                        .ok();
                    return;
                }
                if payload.student_ids.is_empty() {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkEmpty")
                        .ok();
                    return;
                }
                if payload.student_ids.len() > BULK_MAX_IDS {
                    socket
                        .emit(constants::class::ERROR, "errors:class.bulkTooMany")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::bulk_remove_students(
                    &ctx.db_pool,
                    payload.student_ids,
                    payload.class_id,
                    me,
                    BULK_MAX_IDS,
                )
                .await
                {
                    Ok(outcome) => {
                        socket
                            .emit(constants::class::BULK_STUDENT_REMOVED, &outcome)
                            .ok();
                        emit_student_list_refresh(&socket, &ctx, me).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:bulkRemoveStudent failed: actor_user_id={} class_id={} error={}",
                            user.user_id,
                            payload.class_id,
                            e
                        );
                        socket
                            .emit(
                                constants::class::ERROR,
                                "errors:class.removeFromClassFailed",
                            )
                            .ok();
                    }
                }
            });
        }
    });
}

/// `class:getPins` — batch PIN fetch for one class. Unicast to requester only
/// (never broadcast). Auth gate mirrors `class:studentPin` (require_user + owner scope).
fn register_get_pins(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::GET_PINS, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<GetPinsPayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:getPins denied: no user session");
                        return;
                    }
                };

                if payload.class_id <= 0 {
                    socket
                        .emit(constants::class::ERROR, "errors:class.invalidClassId")
                        .ok();
                    return;
                }

                let me = me_from_user(&user);

                match db::get_class_pins(&ctx.db_pool, payload.class_id, me).await {
                    Ok(pins) => {
                        // CRITICAL: unicast to requester only — never broadcast PIN material.
                        socket
                            .emit(
                                constants::class::PINS_DATA,
                                &serde_json::json!({
                                    "classId": payload.class_id,
                                    "pins": pins,
                                }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:getPins failed: actor_user_id={} class_id={} error={}",
                            user.user_id,
                            payload.class_id,
                            e
                        );
                        socket
                            .emit(constants::class::ERROR, "errors:class.studentPinFailed")
                            .ok();
                    }
                }
            });
        }
    });
}
