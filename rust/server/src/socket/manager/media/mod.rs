//! MANAGER.MEDIA — media library handlers

use super::super::HandlerCtx;
use crate::db;
use crate::state::safe_asset_id;
use image::codecs::webp::WebPEncoder;
use image::io::Reader as ImageReader;
use image::ColorType;
use std::io::Cursor;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use chrono::Utc;
use uuid::Uuid;

mod validate;
mod files;

/// Transcode raw image bytes (PNG/JPEG/WebP) to WebP. Returns (webp_bytes, width, height).
/// Never panics — all decode/encode failures become `Err(String)`.
pub fn to_webp(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32), String> {
    // Decode image (PNG/JPEG/WebP only, enforced by Cargo.toml feature allowlist).
    // This will fail on formats outside the allowlist due to missing decoders.
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "errors:media.invalidDataUrl".to_string())?;

    // Enforce decode limits BEFORE decoding: the decoder rejects an oversized/
    // decompression-bomb image DURING decode, before the full pixel buffer is
    // allocated. A post-decode dimension check is too late — the OOM already happened.
    let mut limits = image::io::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);

    let img = reader.decode()
        .map_err(|_| "errors:media.invalidDataUrl".to_string())?;

    let width = img.width();
    let height = img.height();

    let rgba = img.to_rgba8();
    let mut output = Vec::new();
    WebPEncoder::new_lossless(&mut output)
        .encode(
            rgba.as_raw(),
            width,
            height,
            ColorType::Rgba8,
        )
        .map_err(|_| "errors:submission.imageGenFailed".to_string())?;

    Ok((output, width, height))
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx.clone());
    register_upload(socket, ctx.clone());
    register_delete(socket, ctx);
}

fn register_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth: verify manager is logged in
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &())
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                // Query media assets from the shared DB and emit the list.
                let media_list = db::get_media_list(&ctx.db_pool, me).await;
                socket.emit(constants::media::DATA, &media_list).ok();
            });
        }
    });
}

fn register_upload(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::UPLOAD, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &())
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                // Validate payload (Zod-like validator). Returns first error message.
                let (filename, data_url, category) = match validate::validate_upload_payload(&payload) {
                    Ok(data) => data,
                    Err(error_msg) => {
                        socket.emit(constants::media::ERROR, &error_msg).ok();
                        return;
                    }
                };

                // Decode base64 data URL
                let (mime, buffer) = match validate::decode_data_url(data_url) {
                    Ok(result) => result,
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                        return;
                    }
                };

                // Infer type and validate MIME
                let (inferred_type, resolved_category) = match validate::infer_type_and_validate_mime(&mime, category) {
                    Ok(result) => result,
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                        return;
                    }
                };

                // Images are transcoded to WebP (parity with Node toWebp); audio/video stay raw.
                // Wrap in spawn_blocking to avoid starving the tokio worker pool on large uploads.
                let (write_buffer, size, width, height) = if inferred_type == "image" {
                    let buffer_clone = buffer.clone();
                    let transcode_result = tokio::task::spawn_blocking(move || to_webp(&buffer_clone))
                        .await;
                    
                    let (webp_bytes, w, h) = match transcode_result {
                        Ok(Ok(v)) => v,
                        Ok(Err(e)) => {
                            socket.emit(constants::media::ERROR, &e).ok();
                            return;
                        }
                        Err(_) => {
                            socket.emit(constants::media::ERROR, "errors:media.saveFailed").ok();
                            return;
                        }
                    };
                    let webp_size = webp_bytes.len() as i32;
                    (webp_bytes, webp_size, Some(w as i32), Some(h as i32))
                } else {
                    (buffer.clone(), buffer.len() as i32, None, None)
                };

                // Normalize filename and generate stored filename
                let normalized_stem = files::normalize_media_stem(filename);
                let random_suffix = Uuid::new_v4().to_string().replace("-", "")[0..8].to_string();
                let ext = validate::extension_for_mime(&mime);
                let stored_filename = format!("{}-{}{}", normalized_stem, random_suffix, ext);
                let url = format!("/media/{}/{}", resolved_category, stored_filename);

                // Generate media asset ID: <category>-<filename-without-extension>
                let filename_stem = stored_filename
                    .rsplit('.')
                    .nth(1)
                    .unwrap_or(&stored_filename)
                    .to_string();
                let asset_id = format!("{}-{}", resolved_category, filename_stem);

                // Validate asset ID
                if let Err(e) = safe_asset_id(&asset_id) {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                // Write file to disk (spawn_blocking)
                let buffer_clone = write_buffer.clone();
                let stored_filename_clone = stored_filename.clone();
                let category_clone = resolved_category.clone();
                let write_result = tokio::task::spawn_blocking(move || {
                    files::write_media_file(&buffer_clone, &category_clone, &stored_filename_clone)
                })
                .await;

                if let Ok(Err(e)) = write_result {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                if let Err(_) = write_result {
                    socket
                        .emit(constants::media::ERROR, "errors:media.saveFailed")
                        .ok();
                    return;
                }

                // Insert into database
                let uploaded_at = Utc::now();
                match db::insert_media_asset(
                    &ctx.db_pool,
                    &asset_id,
                    &stored_filename,
                    &url,
                    size,
                    &inferred_type,
                    &resolved_category,
                    "upload",
                    width,
                    height,
                    uploaded_at,
                    &write_buffer,
                    Some(user.user_id),
                )
                .await
                {
                    Ok(_) => {
                        socket.emit(constants::media::UPLOAD_SUCCESS, &()).ok();
                        let media_list = db::get_media_list(&ctx.db_pool, me).await;
                        socket.emit(constants::media::DATA, &media_list).ok();
                    }
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &())
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                // Validate payload (Zod-like validator). Returns first error message or the ID.
                let id = match validate::validate_delete_payload(&payload) {
                    Ok(id) => id,
                    Err(error_msg) => {
                        socket.emit(constants::media::ERROR, &error_msg).ok();
                        return;
                    }
                };

                // Validate ID safety
                if let Err(e) = safe_asset_id(id) {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                // Get media asset by ID from database
                let media_entry = match files::get_media_asset_by_id(&ctx.db_pool, id).await {
                    Some(entry) => entry,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };

                // Extract category and filename for disk deletion — treat missing fields as error
                let category = match media_entry.get("category").and_then(|v| v.as_str()) {
                    Some(cat) => cat,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };
                let filename = match media_entry.get("filename").and_then(|v| v.as_str()) {
                    Some(f) => f,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };

                // Delete from disk (spawn_blocking)
                let category_owned = category.to_string();
                let filename_owned = filename.to_string();
                let disk_result =
                    tokio::task::spawn_blocking(move || {
                        files::delete_media_file(&category_owned, &filename_owned)
                    })
                    .await;

                if let Ok(Err(e)) = disk_result {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                if let Err(_) = disk_result {
                    socket
                        .emit(constants::media::ERROR, "errors:media.saveFailed")
                        .ok();
                    return;
                }

                // Delete from database
                if !db::delete_media_asset(&ctx.db_pool, id).await {
                    socket
                        .emit(constants::media::ERROR, "errors:media.notFound")
                        .ok();
                    return;
                }

                // Emit updated list
                let media_list = db::get_media_list(&ctx.db_pool, me).await;
                socket.emit(constants::media::DATA, &media_list).ok();
            });
        }
    });
}


#[cfg(test)]
mod tests {
    use super::to_webp;

    #[test]
    fn to_webp_rejects_malformed_input_without_panic() {
        let result = to_webp(b"not-valid-image-data");
        assert!(result.is_err(), "Malformed input should return Err, not panic");
        if let Err(e) = result {
            assert!(e.contains("errors:"), "Error should be an i18n key");
        }
    }

    #[test]
    fn to_webp_rejects_empty_input() {
        let result = to_webp(b"");
        assert!(result.is_err(), "Empty input should return Err");
    }

    #[test]
    fn to_webp_rejects_invalid_png_header() {
        // Fake PNG signature but invalid data
        let fake_png = vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 
                            0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
        let result = to_webp(&fake_png);
        assert!(result.is_err(), "Invalid PNG should error");
    }
}