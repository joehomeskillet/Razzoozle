//! CLASSES handlers — manage class rosters for Klassen-Modus
//!
//! class:list — list all classes for the user
//! class:create — create a new class
//! class:update — update class name
//! class:delete — delete a class (cascades to students)
//! class:addStudent — add a student to a class
//! class:removeStudent — remove a student from a class
//! class:updateStudent — update a student's display name
//! class:getStudents — fetch students for a class

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

/// Map a known db-layer ownership/permission error string to a distinct i18n
/// error key so the client toast can tell "not your class/student" apart from
/// a generic operation failure. Falls back to `fallback` for anything else.
fn ownership_error_key(err: &str, fallback: &'static str) -> &'static str {
    match err {
        "permission denied for one or more classes" | "class not found or not owned" => {
            "errors:class.classNotOwned"
        }
        "cannot manage student" => "errors:class.cannotManageStudent",
        _ => fallback,
    }
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx.clone());
    register_create(socket, ctx.clone());
    register_update(socket, ctx.clone());
    register_delete(socket, ctx.clone());
    register_add_student(socket, ctx.clone());
    register_remove_student(socket, ctx.clone());
    register_update_student(socket, ctx.clone());
    register_get_students(socket, ctx.clone());
    register_move_student(socket, ctx.clone());
    register_remove_from_class(socket, ctx.clone());
    register_student_classes(socket, ctx.clone());
    register_list_all_students(socket, ctx.clone());
    register_create_student(socket, ctx.clone());
    register_student_pin(socket, ctx.clone());
    register_regen_pin(socket, ctx.clone());
}

fn register_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
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

                let me = if user.role == "admin" { None } else { Some(user.user_id) };
                let classes = db::get_classes(&ctx.db_pool, me).await;

                socket.emit(constants::class::DATA, &classes).ok();
            });
        }
    });
}

fn register_create(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::CREATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                let name = match payload.get("name").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                        return;
                    }
                };

                match db::create_class(&ctx.db_pool, name, user.user_id).await {
                    Ok(id) => {
                        let class_obj = serde_json::json!({
                            "id": id,
                            "name": name,
                        });
                        socket.emit(constants::class::CREATE_SUCCESS, &class_obj).ok();
                    }
                    Err(e) => {
                        eprintln!("Failed to create class: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.createFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_update(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::UPDATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                let class_id = match payload.get("id").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidId").ok();
                        return;
                    }
                };

                let name = match payload.get("name").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::update_class(&ctx.db_pool, class_id, name, me).await {
                    Ok(0) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        socket.emit(constants::class::UPDATE_SUCCESS, &serde_json::json!({})).ok();
                    }
                    Err(e) => {
                        eprintln!("Failed to update class: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.updateFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<i64>(class_id)| {
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

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::delete_class(&ctx.db_pool, class_id, me).await {
                    Ok(0) => {
                        tracing::warn!(
                            "class:delete denied: class_id={} actor_user_id={} actor_role={}",
                            class_id, user.user_id, user.role
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(rows_affected) => {
                        tracing::info!(
                            "class:delete: class_id={} actor_user_id={} actor_role={} rows_affected={}",
                            class_id, user.user_id, user.role, rows_affected
                        );
                        socket.emit(constants::class::DELETE_SUCCESS, &serde_json::json!({"id": class_id})).ok();
                    }
                    Err(e) => {
                        tracing::warn!(
                            "class:delete failed: class_id={} actor_user_id={} actor_role={} error={}",
                            class_id, user.user_id, user.role, e
                        );
                        socket.emit(constants::class::ERROR, "errors:class.deleteFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_add_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::ADD_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                let class_id = match payload.get("classId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidClassId").ok();
                        return;
                    }
                };

                let display_name = match payload.get("displayName").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                        return;
                    }
                };

                // Verify class ownership before adding student
                let me = if user.role == "admin" { None } else { Some(user.user_id) };
                match db::get_class(&ctx.db_pool, class_id, me).await {
                    Ok(_) => {
                        // Class exists and is owned
                        match db::add_student(&ctx.db_pool, class_id, display_name, user.user_id).await {
                            Ok(student_id) => {
                                let student_obj = serde_json::json!({
                                    "id": student_id,
                                    "displayName": display_name,
                                    "classId": class_id,
                                });
                                socket.emit(constants::class::STUDENT_ADDED, &student_obj).ok();
                            }
                            Err(e) => {
                                eprintln!("Failed to add student: {}", e);
                                socket.emit(constants::class::ERROR, "errors:class.addStudentFailed").ok();
                            }
                        }
                    }
                    Err(_) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_remove_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::REMOVE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<i64>(student_id)| {
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

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::remove_student(&ctx.db_pool, student_id, me).await {
                    Ok(0) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        socket.emit(constants::class::STUDENT_REMOVED, &serde_json::json!({"studentId": student_id})).ok();
                    }
                    Err(e) => {
                        eprintln!("Failed to remove student: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.removeStudentFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_update_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::UPDATE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
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

                let student_id = match payload.get("id").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidId").ok();
                        return;
                    }
                };

                let display_name = payload.get("displayName").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
                let first_name = payload.get("firstName").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
                let last_name = payload.get("lastName").and_then(|v| v.as_str());

                // Addendum: birthdate is optional here too — absent/empty means
                // "not touched by this update" (same COALESCE semantics as
                // first_name/last_name), so it's only parsed+validated when present.
                let birthdate = match payload.get("birthdate").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    Some(date_str) => match chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                        Ok(d) => {
                            if d > chrono::Utc::now().date_naive() {
                                tracing::warn!("class:updateStudent rejected: birthdate {} is in the future", d);
                                socket.emit(constants::class::ERROR, "errors:class.birthdateInFuture").ok();
                                return;
                            }
                            Some(d)
                        }
                        Err(_) => {
                            socket.emit(constants::class::ERROR, "errors:class.invalidBirthdate").ok();
                            return;
                        }
                    },
                    None => None,
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::update_student(&ctx.db_pool, student_id, display_name, first_name, last_name, birthdate, me).await {
                    Ok(0) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        // Emit what changed. birthdate is only included when this
                        // request actually provided one — omitting it otherwise
                        // avoids the client overwriting an unrelated existing value.
                        let mut event = serde_json::json!({
                            "id": student_id,
                            "displayName": display_name,
                            "firstName": first_name,
                            "lastName": last_name.filter(|s| !s.is_empty())
                        });
                        if let Some(d) = birthdate {
                            event["birthdate"] = serde_json::json!(d.format("%Y-%m-%d").to_string());
                        }
                        socket.emit(constants::class::STUDENT_UPDATED, &event).ok();
                    }
                    Err(e) => {
                        eprintln!("Failed to update student: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.updateStudentFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_get_students(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::GET_STUDENTS, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<i64>(class_id)| {
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

                let me = if user.role == "admin" { None } else { Some(user.user_id) };
                let students = db::get_students(&ctx.db_pool, class_id, me).await;

                socket.emit(constants::class::STUDENTS_DATA, &serde_json::json!({
                    "classId": class_id,
                    "students": students,
                })).ok();
            });
        }
    });
}

fn register_move_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::MOVE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:moveStudent denied: no user session");
                        return;
                    }
                };

                let student_id = match payload.get("studentId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidStudentId").ok();
                        return;
                    }
                };

                let class_id = match payload.get("classId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidClassId").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::move_student_to_class(&ctx.db_pool, student_id, class_id, me).await {
                    Ok(()) => {
                        // Fetch the student's classes to get the joinedAt timestamp
                        match db::get_student_classes(&ctx.db_pool, student_id, me).await {
                            Ok(classes) => {
                                // Find the joined_at for the target class
                                if let Some(class) = classes.iter().find(|c| c.get("id").and_then(|v| v.as_i64()) == Some(class_id)) {
                                    if let Some(joined_at) = class.get("joinedAt").and_then(|v| v.as_str()) {
                                        socket.emit(constants::class::STUDENT_MOVED, &serde_json::json!({
                                            "studentId": student_id,
                                            "classId": class_id,
                                            "joinedAt": joined_at,
                                        })).ok();
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("class:moveStudent failed to fetch classes: {}", e);
                                socket.emit(constants::class::ERROR, "errors:class.moveStudentFailed").ok();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("class:moveStudent failed: {}", e);
                        let key = ownership_error_key(&e, "errors:class.moveStudentFailed");
                        socket.emit(constants::class::ERROR, key).ok();
                    }
                }
            });
        }
    });
}

fn register_remove_from_class(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::REMOVE_FROM_CLASS, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:removeFromClass denied: no user session");
                        return;
                    }
                };

                let student_id = match payload.get("studentId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidStudentId").ok();
                        return;
                    }
                };

                let class_id = match payload.get("classId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidClassId").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::remove_student_from_class(&ctx.db_pool, student_id, class_id, me).await {
                    Ok(student_deleted) => {
                        socket.emit(constants::class::REMOVED_FROM_CLASS, &serde_json::json!({
                            "studentId": student_id,
                            "classId": class_id,
                            "studentDeleted": student_deleted,
                        })).ok();
                    }
                    Err(e) => {
                        tracing::warn!("class:removeFromClass failed: {}", e);
                        let key = ownership_error_key(&e, "errors:class.removeFromClassFailed");
                        socket.emit(constants::class::ERROR, key).ok();
                    }
                }
            });
        }
    });
}

fn register_student_classes(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::STUDENT_CLASSES, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:studentClasses denied: no user session");
                        return;
                    }
                };

                let student_id = match payload.get("studentId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidStudentId").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::get_student_classes(&ctx.db_pool, student_id, me).await {
                    Ok(classes) => {
                        socket.emit(constants::class::STUDENT_CLASSES_DATA, &serde_json::json!({
                            "studentId": student_id,
                            "classes": classes,
                        })).ok();
                    }
                    Err(e) => {
                        tracing::warn!("class:studentClasses failed: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.getStudentClassesFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_list_all_students(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::LIST_ALL_STUDENTS, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:listAllStudents denied: no user session");
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::list_all_students(&ctx.db_pool, me).await {
                    Ok(students) => {
                        socket.emit(constants::class::ALL_STUDENTS_DATA, &serde_json::json!({
                            "students": students,
                        })).ok();
                    }
                    Err(e) => {
                        tracing::warn!("class:listAllStudents failed: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.listAllStudentsFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_create_student(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::CREATE_STUDENT, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:createStudent denied: no user session");
                        return;
                    }
                };

                let first_name = match payload.get("firstName").and_then(|v| v.as_str()) {
                    Some(n) => {
                        let trimmed = n.trim();
                        if trimmed.is_empty() || trimmed.len() > 255 {
                            socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                            return;
                        }
                        trimmed
                    }
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                        return;
                    }
                };

                let last_name = payload.get("lastName").and_then(|v| v.as_str()).unwrap_or("").trim();

                let class_ids: Vec<i64> = payload
                    .get("classIds")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_i64())
                            .collect()
                    })
                    .unwrap_or_default();

                let birthdate = if let Some(date_str) = payload.get("birthdate").and_then(|v| v.as_str()) {
                    match chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                        Ok(d) => {
                            if d > chrono::Utc::now().date_naive() {
                                tracing::warn!("class:createStudent rejected: birthdate {} is in the future", d);
                                socket.emit(constants::class::ERROR, "errors:class.birthdateInFuture").ok();
                                return;
                            }
                            Some(d)
                        }
                        Err(_) => {
                            socket.emit(constants::class::ERROR, "errors:class.invalidBirthdate").ok();
                            return;
                        }
                    }
                } else {
                    None
                };

                // CRITICAL: Generate PIN SYNC before any .await
                let pin = crate::http::emoji_pin::generate_pin();
                let labels = crate::http::emoji_pin::labels_for(&pin).unwrap_or_default();

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                // Bug A fix: the classIds ownership check must use the admin-aware
                // `me` (None = admin, bypasses ownership), while the student row's
                // owner_id is always the REAL creator (user.user_id) — previously
                // both were collapsed into one `me.unwrap_or(1)` value, so an admin
                // (me=None) got hardcoded to a fake owner_id=1 for the check, which
                // then denied any class not owned by user id 1.
                match db::create_student(&ctx.db_pool, first_name, last_name, &class_ids, user.user_id, me, birthdate, &pin).await {
                    Ok(student_id) => {
                        // Fetch class names for the response
                        let class_names = db::get_student_classes(&ctx.db_pool, student_id, me).await
                            .unwrap_or_default();

                        let display_name = if last_name.is_empty() {
                            first_name.to_string()
                        } else {
                            format!("{} {}", first_name, last_name)
                        };

                        let final_last = if last_name.is_empty() { None } else { Some(last_name) };

                        socket.emit(constants::class::STUDENT_CREATED, &serde_json::json!({
                            "id": student_id,
                            "displayName": display_name,
                            "firstName": first_name,
                            "lastName": final_last,
                            "pin": pin,
                            "labels": labels, "symbols": crate::http::emoji_pin::symbols_of(&pin).unwrap_or_default(),
                            "classes": class_names,
                            "birthdate": birthdate.map(|d| d.format("%Y-%m-%d").to_string()),
                        })).ok();
                    }
                    Err(e) => {
                        tracing::warn!("class:createStudent failed: {}", e);
                        let key = ownership_error_key(&e, "errors:class.createStudentFailed");
                        socket.emit(constants::class::ERROR, key).ok();
                    }
                }
            });
        }
    });
}

fn register_student_pin(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::STUDENT_PIN, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:studentPin denied: no user session");
                        return;
                    }
                };

                let student_id = match payload.get("studentId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidStudentId").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::class_get_student_pin(&ctx.db_pool, student_id, me).await {
                    Ok(Some(pin)) => {
                        let labels = crate::http::emoji_pin::labels_for(&pin).unwrap_or_default();
                        socket.emit(constants::class::STUDENT_PIN_DATA, &serde_json::json!({
                            "studentId": student_id,
                            "pin": pin,
                            "labels": labels, "symbols": crate::http::emoji_pin::symbols_of(&pin).unwrap_or_default(),
                        })).ok();
                    }
                    Ok(None) => {
                        // Backfill: generate PIN SYNC before any .await
                        let pin = crate::http::emoji_pin::generate_pin();
                        let labels = crate::http::emoji_pin::labels_for(&pin).unwrap_or_default();

                        match db::class_set_student_pin(&ctx.db_pool, student_id, &pin, me).await {
                            Ok(_) => {
                                socket.emit(constants::class::STUDENT_PIN_DATA, &serde_json::json!({
                                    "studentId": student_id,
                                    "pin": pin,
                                    "labels": labels, "symbols": crate::http::emoji_pin::symbols_of(&pin).unwrap_or_default(),
                        })).ok();
                            }
                            Err(e) => {
                                tracing::warn!("class:studentPin failed to set pin: {}", e);
                                socket.emit(constants::class::ERROR, "errors:class.studentPinFailed").ok();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("class:studentPin failed: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.studentPinFailed").ok();
                    }
                }
            });
        }
    });
}

fn register_regen_pin(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::class::REGEN_PIN, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::class::ERROR, "errors:class.unauthorized")
                            .ok();
                        tracing::warn!("class:regenPin denied: no user session");
                        return;
                    }
                };

                let student_id = match payload.get("studentId").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidStudentId").ok();
                        return;
                    }
                };

                // CRITICAL: Generate PIN SYNC before any .await
                let pin = crate::http::emoji_pin::generate_pin();
                let labels = crate::http::emoji_pin::labels_for(&pin).unwrap_or_default();

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::class_set_student_pin(&ctx.db_pool, student_id, &pin, me).await {
                    Ok(_) => {
                        socket.emit(constants::class::PIN_REGENERATED, &serde_json::json!({
                            "studentId": student_id,
                            "pin": pin,
                            "labels": labels, "symbols": crate::http::emoji_pin::symbols_of(&pin).unwrap_or_default(),
                        })).ok();
                    }
                    Err(e) => {
                        tracing::warn!("class:regenPin failed: {}", e);
                        socket.emit(constants::class::ERROR, "errors:class.regenPinFailed").ok();
                    }
                }
            });
        }
    });
}
