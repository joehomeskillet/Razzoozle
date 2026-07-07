// Shared fs-path helpers + safe-id guard used across every config/ domain
// module. Extracted verbatim from services/config.ts (SRP split) — only
// `export` was added where a helper is consumed by another domain module (it
// used to be a same-file private const); logic is unchanged.
import { resolve } from "path"
import fs from "fs"

const inContainerPath = process.env.CONFIG_PATH

export const getPath = (path = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

// RAZZOOLE_DEV — fail-closed dev/observability gate. Mirrors the
// `RAHOOT_SIM_MODE !== "1"` pattern (services/game/index.ts): the ABILITY is in
// the prod bundle, but every dev-only HTTP surface (OpenAPI, Scalar docs,
// /metrics, observability + client-events endpoints) is absent (404) unless the
// operator explicitly opts in. Default OFF, any value other than "1" is OFF.
export const isDevMode = (): boolean => process.env.RAZZOOLE_DEV === "1"

// Optional DEV-route API key. When set (and dev mode is on), the DEV-gated
// HTTP routes additionally require this token (header X-Manager-Token or
// ?token= query). Unset/empty -> dev-gate only (unchanged behaviour).
export const devApiKey = (): string | undefined =>
  process.env.DEV_API_KEY || undefined

// Read-only seed assets baked into the image (presets + brand backgrounds/logo).
// Mirrors getPath: BRANDING_PATH is set in Docker (=/app/branding via Dockerfile)
// and falls back to the repo-relative `source/branding` in dev (the socket dev
// process runs from packages/socket, so ../../branding === source/branding,
// exactly like CONFIG_PATH's ../../config fallback).
const brandingRoot = process.env.BRANDING_PATH

export const getBrandingPath = (path = "") =>
  brandingRoot
    ? resolve(brandingRoot, path)
    : resolve(process.cwd(), "../../branding", path)

// Quizz/result ids are server-generated uuids / safe slugs. Reject anything that
// could escape the quizz/results dir (path traversal) before using it in a path.
const SAFE_ID = /^[A-Za-z0-9_-]+$/
// Even though these literals pass SAFE_ID, reject them outright: used as object
// keys downstream they enable prototype pollution. Additive guard on top of the
// regex test (same error type as the regex path).
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"])
export const assertSafeId = (id: string): void => {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error("Invalid id")
  }

  if (RESERVED_IDS.has(id)) {
    throw new Error("Invalid id")
  }
}

export const ensureDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
