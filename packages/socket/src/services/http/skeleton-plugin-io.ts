import type { IncomingMessage, ServerResponse } from "http"
import {
  buildPluginZip,
  buildSkeletonZip,
  importPluginZip,
  importSkeletonZip,
  readPlugins,
  assertSafeId,
  resolvePluginAsset,
} from "@razzoozle/socket/services/config"
import { jsonOk, jsonError } from "./respond"
import { readRawBody, statusFrom413, SKELETON_IMPORT_MAX } from "./body"
import { authorizeManagerRequest } from "./broadcasters/manager-auth"

let themeBroadcaster: ((theme: unknown) => void) | null = null

export const registerThemeBroadcaster = (
  fn: (theme: unknown) => void,
): void => {
  themeBroadcaster = fn
}

// Broadcast the installed-plugin list (InstalledPlugin[]) after an HTTP import.
// Mirrors registerThemeBroadcaster: index.ts wires it to io.emit(PLUGIN_CONFIG).
let pluginBroadcaster: ((plugins: unknown) => void) | null = null

export const registerPluginBroadcaster = (
  fn: (plugins: unknown) => void,
): void => {
  pluginBroadcaster = fn
}

export const handleSkeletonExport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await buildSkeletonZip()
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="razzoozle-skeleton.zip"',
        "content-length": buf.byteLength,
      })
      res.end(buf)
    } catch (err) {
      jsonError(res, 500, err instanceof Error ? err.message : "error")
    }
  })()
}

export const handleSkeletonImport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await readRawBody(req, SKELETON_IMPORT_MAX)
      const theme = await importSkeletonZip(buf)
      if (themeBroadcaster) {
        themeBroadcaster(theme)
      }
      jsonOk(res, { ok: true, theme })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "error")
    }
  })()
}

// POST /api/plugins/import — body = raw ZIP bytes. Manager-gated, mirrors
// handleSkeletonImport. Stores+extracts only (NO server.js execution — WP3).
export const handlePluginImport = (
  req: IncomingMessage,
  res: ServerResponse,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      const buf = await readRawBody(req, SKELETON_IMPORT_MAX)
      const plugin = await importPluginZip(buf)
      if (pluginBroadcaster) {
        pluginBroadcaster(readPlugins())
      }
      jsonOk(res, { ok: true, plugin })
    } catch (err) {
      const status = statusFrom413(err, 400)
      jsonError(res, status, err instanceof Error ? err.message : "error")
    }
  })()
}

// GET /api/plugins/:id/export — repack config/plugins/<id>/ as a ZIP. Manager-
// gated, mirrors handleSkeletonExport.
export const handlePluginExport = (
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
): void => {
  if (!authorizeManagerRequest(req)) {
    jsonError(res, 401, "unauthorized")
    return
  }

  void (async () => {
    try {
      assertSafeId(id ?? "")
      const buf = await buildPluginZip(id!)
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="plugin-${id}.zip"`,
        "content-length": buf.byteLength,
      })
      res.end(buf)
    } catch (err) {
      jsonError(res, 400, err instanceof Error ? err.message : "error")
    }
  })()
}

// GET /plugins/:id/* — serve an installed plugin's static files (ui.js, assets)
// directly from config/plugins/<id>/. PUBLIC (the client loads ui.js without a
// manager session); resolvePluginAsset enforces assertSafeId + path-traversal +
// ext-allowlist and returns null → 404 for anything else. No code is executed —
// the file is streamed as bytes with a content-type by extension.
export const handlePluginAsset = (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  rest: string | undefined,
): void => {
  const resolved = resolvePluginAsset(id ?? "", rest ?? "")

  if (!resolved) {
    jsonError(res, 404, "not found")
    return
  }

  // A plugin's files live at a STABLE url (/plugins/<id>/ui.js) and a same-id
  // reinstall keeps that url, so `immutable` would defeat the cache-bust — the
  // browser would never re-fetch the new bytes. Serve cacheable but always
  // revalidated (max-age=0, must-revalidate) so a reinstall is picked up while
  // an unchanged file still 304s.
  res.writeHead(200, {
    "content-type": resolved.contentType,
    "content-length": resolved.buffer.byteLength,
    "cache-control": "public, max-age=0, must-revalidate",
  })
  res.end(resolved.buffer)
}
