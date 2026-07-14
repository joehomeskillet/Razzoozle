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

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx.clone());
    register_create(socket, ctx.clone());
    register_update(socket, ctx.clone());
    register_delete(socket, ctx.clone());
    register_add_student(socket, ctx.clone());
    register_remove_student(socket, ctx.clone());
    register_update_student(socket, ctx.clone());
    register_get_students(socket, ctx.clone());
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
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        socket.emit(constants::class::DELETE_SUCCESS, &serde_json::json!({"id": class_id})).ok();
                    }
                    Err(e) => {
                        eprintln!("Failed to delete class: {}", e);
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
                        socket.emit(constants::class::STUDENT_REMOVED, &serde_json::json!({})).ok();
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

                let display_name = match payload.get("displayName").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        socket.emit(constants::class::ERROR, "errors:class.invalidName").ok();
                        return;
                    }
                };

                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                match db::update_student(&ctx.db_pool, student_id, display_name, me).await {
                    Ok(0) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Ok(_) => {
                        socket.emit(constants::class::STUDENT_UPDATED, &serde_json::json!({})).ok();
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
