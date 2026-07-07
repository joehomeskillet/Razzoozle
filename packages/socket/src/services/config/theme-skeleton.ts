// Skeleton ZIP export/import (theme bundle for external LLM authoring) +
// custom CSS/JS asset get/set + factory reset. Extracted verbatim from
// services/config.ts (SRP split) — `export` was added to SKELETON_ASSET_EXT,
// SKELETON_ASSET_MAX_BYTES, SKELETON_TOTAL_MAX_BYTES, SKELETON_ENTRY_MAX (now
// also consumed by ./plugins, which reuses the same ZIP entry/size caps and
// extends the same ext allowlist).
import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { themeValidator } from "@razzoozle/common/validators/theme"
import { SOUND_SLOTS } from "@razzoozle/common/constants"
import {
  renderSkeletonCss,
  renderSkeletonDoc,
  renderSkeletonJs,
} from "@razzoozle/common/skeleton-doc"
import { renderSkeletonDemo } from "@razzoozle/common/skeleton-demo"
import JSZip from "jszip"
import fs from "fs"
import { basename, extname, resolve } from "path"
import { ensureDir, getPath } from "@razzoozle/socket/services/config/shared"
import { getTheme, setTheme } from "@razzoozle/socket/services/config/theme"

const SKELETON_FORMAT_VERSION = 1
export const SKELETON_ASSET_MAX_BYTES = 512 * 1024
export const SKELETON_TOTAL_MAX_BYTES = 32 * 1024 * 1024
export const SKELETON_ENTRY_MAX = 200
export const SKELETON_ASSET_EXT = new Set([
  "svg",
  "webp",
  "png",
  "jpg",
  "jpeg",
  "woff2",
  "mp3",
  "wav",
  "ogg",
])
const SKELETON_BACKGROUND_SLOTS = ["auth", "managerGame", "playerGame"] as const

const skeletonSourcePath = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  if (value.startsWith("/media/") || value.startsWith("/theme/")) {
    return getPath(value.slice(1))
  }

  return null
}

export const buildSkeletonZip = async (): Promise<Buffer> => {
  const theme = getTheme()
  const zip = new JSZip()

  zip.file(
    "skeleton.json",
    JSON.stringify(
      {
        formatVersion: SKELETON_FORMAT_VERSION,
        name: theme.appTitle || "razzoozle",
        theme,
      },
      null,
      2,
    ),
  )

  const addAsset = (value: string | null, entryDir: string): void => {
    const src = skeletonSourcePath(value)

    if (!src || !fs.existsSync(src) || !value) {
      return
    }

    zip.file(`${entryDir}/${basename(value)}`, fs.readFileSync(src))
  }

  addAsset(theme.logo, "assets")
  addAsset(theme.backgrounds.auth, "assets/backgrounds")
  addAsset(theme.backgrounds.managerGame, "assets/backgrounds")
  addAsset(theme.backgrounds.playerGame, "assets/backgrounds")

  // Sound-pack overrides → assets/sounds/ (mirrors the backgrounds branch). A
  // null slot has no asset to ship; addAsset no-ops on null/missing files.
  for (const slot of SOUND_SLOTS) {
    addAsset(theme.sounds[slot], "assets/sounds")
  }

  // Always ship theme.css / theme.js: the saved custom override if one exists,
  // otherwise a generated scaffold (the bundle is meant to carry css + js, and
  // the scaffold gives an LLM a concrete starting point).
  const cssFile = getPath("theme/skeleton.css")
  zip.file(
    "theme.css",
    fs.existsSync(cssFile)
      ? fs.readFileSync(cssFile, "utf-8")
      : renderSkeletonCss(theme),
  )

  const jsFile = getPath("theme/skeleton.js")
  zip.file(
    "theme.js",
    fs.existsSync(jsFile)
      ? fs.readFileSync(jsFile, "utf-8")
      : renderSkeletonJs(),
  )

  zip.file("SKELETON.md", renderSkeletonDoc(theme))

  // Themed + animated preview pages (phone-game / lobby / presentation) plus the
  // animation stylesheet, so an LLM that receives the ZIP can open demo/*.html
  // and visually test the theme it authored. Export-only (ignored on import).
  for (const file of renderSkeletonDemo(theme)) {
    zip.file(file.path, file.content)
  }

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

export const importSkeletonZip = async (buf: Buffer): Promise<Theme> => {
  const zip = await JSZip.loadAsync(buf)
  const entries = Object.values(zip.files)

  if (entries.length > SKELETON_ENTRY_MAX) {
    throw new Error("errors:skeleton.tooManyEntries")
  }

  const buffers = new Map<string, Buffer>()
  let totalBytes = 0

  for (const entry of entries) {
    if (entry.dir) {
      continue
    }

    const entryBuffer = await entry.async("nodebuffer")
    totalBytes += entryBuffer.byteLength

    if (totalBytes > SKELETON_TOTAL_MAX_BYTES) {
      throw new Error("errors:skeleton.tooLarge")
    }

    buffers.set(entry.name, entryBuffer)
  }

  const manifest = buffers.get("skeleton.json")

  if (!manifest) {
    throw new Error("errors:skeleton.missingManifest")
  }

  const parsedJson = JSON.parse(manifest.toString("utf-8")) as unknown
  const theme: Theme = themeValidator.parse(
    (parsedJson as { theme?: unknown }).theme,
  )

  for (const entry of entries) {
    if (entry.dir || !entry.name.startsWith("assets/")) {
      continue
    }

    const content = buffers.get(entry.name)
    const base = basename(entry.name)
    const expectedBase = entry.name.replace(
      /^assets\/(backgrounds\/|sounds\/)?/u,
      "",
    )

    if (
      !content ||
      base !== expectedBase ||
      base.includes("/") ||
      base.includes("\\") ||
      base.includes("..") ||
      base === ""
    ) {
      continue
    }

    const ext = extname(base).slice(1).toLowerCase()

    if (!SKELETON_ASSET_EXT.has(ext)) {
      continue
    }

    const isBackground = entry.name.startsWith("assets/backgrounds/")
    const isSound = entry.name.startsWith("assets/sounds/")
    const dest = isBackground
      ? getPath(`media/backgrounds/${base}`)
      : isSound
        ? getPath(`media/sounds/${base}`)
        : getPath(`theme/${base}`)
    ensureDir(resolve(dest, ".."))
    fs.writeFileSync(dest, content)

    if (!isBackground && !isSound && basename(theme.logo ?? "") === base) {
      theme.logo = `/theme/${base}`
    }

    if (isBackground) {
      for (const slot of SKELETON_BACKGROUND_SLOTS) {
        if (basename(theme.backgrounds[slot] ?? "") === base) {
          theme.backgrounds[slot] = `/media/backgrounds/${base}`
        }
      }
    }

    if (isSound) {
      for (const slot of SOUND_SLOTS) {
        if (basename(theme.sounds[slot] ?? "") === base) {
          theme.sounds[slot] = `/media/sounds/${base}`
        }
      }
    }
  }

  const css = buffers.get("theme.css")
  if (css) {
    if (css.byteLength > SKELETON_ASSET_MAX_BYTES) {
      throw new Error("errors:skeleton.assetTooLarge")
    }

    ensureDir(getPath("theme"))
    fs.writeFileSync(getPath("theme/skeleton.css"), css.toString("utf-8"))
    theme.customCssEnabled = true
  }

  const js = buffers.get("theme.js")
  if (js) {
    if (js.byteLength > SKELETON_ASSET_MAX_BYTES) {
      throw new Error("errors:skeleton.assetTooLarge")
    }

    ensureDir(getPath("theme"))
    fs.writeFileSync(getPath("theme/skeleton.js"), js.toString("utf-8"))
    theme.customJsEnabled = true
  }

  theme.skeletonVersion = (theme.skeletonVersion ?? 0) + 1

  return setTheme(theme)
}

export const getSkeletonAsset = (kind: "css" | "js"): string => {
  const file = getPath(
    kind === "css" ? "theme/skeleton.css" : "theme/skeleton.js",
  )

  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : ""
}

export const setSkeletonAsset = (
  kind: "css" | "js",
  content: string,
): Theme => {
  if (typeof content !== "string") {
    throw new Error("errors:skeleton.invalidContent")
  }

  if (Buffer.byteLength(content) > SKELETON_ASSET_MAX_BYTES) {
    throw new Error("errors:skeleton.assetTooLarge")
  }

  ensureDir(getPath("theme"))
  fs.writeFileSync(
    getPath(kind === "css" ? "theme/skeleton.css" : "theme/skeleton.js"),
    content,
  )

  const theme = getTheme()

  if (kind === "css") {
    theme.customCssEnabled = true
  } else {
    theme.customJsEnabled = true
  }

  theme.skeletonVersion = (theme.skeletonVersion ?? 0) + 1

  return setTheme(theme)
}

// Factory-reset the look: discard the active theme + any custom skeleton CSS/JS
// and re-persist the bundled DEFAULT_THEME. setTheme snapshots the prior theme to
// the revision ring first, so a reset stays undoable. Backs the manager's
// "reset to standard" action.
export const resetSkeleton = (): Theme => {
  for (const name of ["skeleton.css", "skeleton.js"]) {
    const file = getPath(`theme/${name}`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }

  return setTheme({ ...DEFAULT_THEME })
}
