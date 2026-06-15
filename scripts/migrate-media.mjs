#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry") || args.includes("--dry-run")
const verbose = dryRun || args.includes("--verbose")

const readArgValue = (name) => {
  const index = args.indexOf(name)

  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}

const configRoot = path.resolve(
  readArgValue("--config") ?? process.env.CONFIG_PATH ?? "config",
)

const mediaRoot = path.join(configRoot, "media")
const themeRoot = path.join(configRoot, "theme")
const quizzRoot = path.join(configRoot, "quizz")
const manifestPath = path.join(configRoot, "media-manifest.json")
const mediaDirs = {
  backgrounds: path.join(mediaRoot, "backgrounds"),
  questions: path.join(mediaRoot, "questions"),
  generated: path.join(mediaRoot, "generated"),
  avatars: path.join(mediaRoot, "avatars"),
  genericAvatars: path.join(mediaRoot, "avatars", "generic"),
  audio: path.join(mediaRoot, "audio"),
}

const imageExts = new Set([".webp", ".png", ".jpg", ".jpeg"])
const audioExts = new Set([".mp3", ".wav", ".ogg", ".m4a"])

// basename -> new /media/... reference path. Populated as files are moved so
// rewrites only touch refs whose underlying file actually moved (no dangling).
const moved = new Map()

const timestamp = () =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/u, "Z")

const log = (message) => {
  if (verbose) {
    console.log(message)
  }
}

const plan = (message, action) => {
  log(`${dryRun ? "[dry] " : ""}${message}`)

  if (!dryRun) {
    action()
  }
}

const ensureConfigExists = () => {
  if (!fs.existsSync(configRoot)) {
    throw new Error(`Config directory not found: ${configRoot}`)
  }
}

const ensureDir = (dir) => {
  plan(`mkdir -p ${dir}`, () => {
    fs.mkdirSync(dir, { recursive: true })
  })
}

const sameOrMissing = (src, dest) =>
  fs.existsSync(src) && fs.existsSync(dest) && fs.statSync(src).ino === fs.statSync(dest).ino

const moveFile = (src, dest) => {
  if (!fs.existsSync(src)) {
    return
  }

  if (sameOrMissing(src, dest)) {
    return
  }

  if (fs.existsSync(dest)) {
    plan(`remove duplicate legacy ${src}`, () => {
      fs.unlinkSync(src)
    })

    return
  }

  ensureDir(path.dirname(dest))
  plan(`move ${src} -> ${dest}`, () => {
    try {
      fs.renameSync(src, dest)
    } catch (error) {
      if (error && error.code === "EXDEV") {
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)

        return
      }

      throw error
    }
  })
}

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
}

const walkFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return []
  }

  const out = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }

  return out
}

const isAudioAsset = (file) => audioExts.has(path.extname(file).toLowerCase())

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf-8"))

// Pull the basename out of a string that contains a /theme/<base> path,
// whether it's relative ("/theme/x.webp") or absolute
// ("https://host/theme/x.webp"). Returns undefined if there's no /theme/ ref.
const themeBasenameOf = (value) => {
  if (typeof value !== "string") {
    return undefined
  }

  if (value.startsWith("/theme/")) {
    return path.basename(value)
  }

  try {
    const url = new URL(value)

    if (url.pathname.startsWith("/theme/")) {
      return path.basename(url.pathname)
    }
  } catch {
    return undefined
  }

  return undefined
}

const collectThemeBasenames = (value, acc) => {
  if (typeof value === "string") {
    const base = themeBasenameOf(value)

    if (base) {
      acc.add(base)
    }

    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectThemeBasenames(item, acc)
    }

    return
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectThemeBasenames(item, acc)
    }
  }
}

// Move only the files that are actually referenced, recording where they went.
// Backgrounds are derived from theme.json refs; questions from quiz refs.
// Generated (gen-*.webp) and audio are kept as before but also recorded.
const moveLegacyFiles = () => {
  const recordMove = (basename, category, refPath) => {
    // Don't double-move: if a basename is already mapped (e.g. moved to
    // backgrounds), reuse that mapping for rewrites instead of moving again.
    if (moved.has(basename)) {
      return
    }

    const src = path.join(themeRoot, basename)

    if (!fs.existsSync(src)) {
      // Referenced but not present in /theme (already moved or external) —
      // record nothing so the ref is left unchanged.
      return
    }

    moveFile(src, path.join(mediaDirs[category], basename))
    moved.set(basename, refPath)
  }

  // Backgrounds: every /theme/<base> referenced by theme.json.
  const themeFile = path.join(themeRoot, "theme.json")

  if (fs.existsSync(themeFile)) {
    const bgBasenames = new Set()
    collectThemeBasenames(readJson(themeFile), bgBasenames)

    for (const basename of bgBasenames) {
      recordMove(basename, "backgrounds", `/media/backgrounds/${basename}`)
    }
  }

  // Questions: every /theme/<base> (relative or absolute) referenced by any quiz.
  for (const file of listFiles(quizzRoot).filter((item) => item.endsWith(".json"))) {
    const qBasenames = new Set()
    collectThemeBasenames(readJson(file), qBasenames)

    for (const basename of qBasenames) {
      recordMove(basename, "questions", `/media/questions/${basename}`)
    }
  }

  // Audio in /theme -> /media/audio (record mapping for rewrites).
  for (const file of listFiles(themeRoot)) {
    if (!isAudioAsset(file)) {
      continue
    }

    const name = path.basename(file)

    if (moved.has(name)) {
      continue
    }

    moveFile(file, path.join(mediaDirs.audio, name))
    moved.set(name, `/media/audio/${name}`)
  }

  // Generated assets already in /media -> /media/generated.
  for (const file of listFiles(mediaRoot)) {
    const name = path.basename(file)

    if (/^gen-.+\.webp$/u.test(name)) {
      moveFile(file, path.join(mediaDirs.generated, name))
      // gen assets are referenced as /media/<name>; key by that ref's basename.
      moved.set(name, `/media/generated/${name}`)
    }
  }
}

const writeJsonIfChanged = (file, original, next) => {
  const serialized = `${JSON.stringify(next, null, 2)}\n`

  if (serialized === original) {
    return
  }

  plan(`rewrite ${file}`, () => {
    fs.writeFileSync(file, serialized)
  })
}

const rewriteStrings = (value, rewrite) => {
  if (typeof value === "string") {
    return rewrite(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteStrings(item, rewrite))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteStrings(item, rewrite)]),
    )
  }

  return value
}

// Reference-driven rewrite: only rewrite a string if its underlying file was
// actually moved (tracked in `moved`). Anything unmoved is left UNCHANGED so it
// keeps resolving via the kept nginx /theme/ alias — no dangling refs.
// PRESERVE the ref's original style: an ABSOLUTE source URL keeps its origin
// (quiz media.url must stay an absolute URL — questionMediaValidator uses
// zod z.url(), which REJECTS site-relative paths and would make the quiz vanish
// from the list). A relative source ("/theme/x") stays relative.
const rewriteRef = (value) => {
  const toRef = (mappedRelative) => {
    try {
      // Absolute input → keep the same origin, swap only the path.
      return new URL(value).origin + mappedRelative
    } catch {
      // Relative input → relative output.
      return mappedRelative
    }
  }

  // /media/gen-*.webp -> /media/generated/<name> (basename keyed in `moved`).
  if (/^\/media\/gen-[^/]+\.webp$/u.test(value)) {
    const base = path.basename(value)
    const mapped = moved.get(base)
    return mapped ? toRef(mapped) : value
  }

  const base = themeBasenameOf(value)

  if (base && moved.has(base)) {
    return toRef(moved.get(base))
  }

  return value
}

const rewriteTheme = () => {
  const file = path.join(themeRoot, "theme.json")

  if (!fs.existsSync(file)) {
    return
  }

  const original = fs.readFileSync(file, "utf-8")
  const parsed = JSON.parse(original)
  const next = rewriteStrings(parsed, rewriteRef)
  writeJsonIfChanged(file, original, next)
}

const rewriteQuizzes = () => {
  for (const file of listFiles(quizzRoot).filter((item) => item.endsWith(".json"))) {
    const original = fs.readFileSync(file, "utf-8")
    const parsed = JSON.parse(original)
    const next = rewriteStrings(parsed, rewriteRef)
    writeJsonIfChanged(file, original, next)
  }
}

const deleteLegacyPngs = () => {
  for (const file of walkFiles(configRoot)) {
    if (path.extname(file).toLowerCase() !== ".png") {
      continue
    }

    const stem = path.basename(file, ".png")
    const sameDirWebp = path.join(path.dirname(file), `${stem}.webp`)
    const migratedWebp = [
      path.join(mediaDirs.questions, `${stem}.webp`),
      path.join(mediaDirs.backgrounds, `${stem}.webp`),
      path.join(mediaDirs.generated, `${stem}.webp`),
    ].some((candidate) => fs.existsSync(candidate))

    if (fs.existsSync(sameDirWebp) || migratedWebp) {
      plan(`delete legacy png ${file}`, () => {
        fs.unlinkSync(file)
      })
    }
  }
}

const mediaType = (file) => {
  const ext = path.extname(file).toLowerCase()

  if (imageExts.has(ext)) {
    return "image"
  }

  if (audioExts.has(ext)) {
    return "audio"
  }

  return undefined
}

const safeId = (parts) => {
  const id = parts
    .join("-")
    .replace(/\.[a-z0-9]+$/iu, "")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")

  return id || "media"
}

const sourceFor = (category, file) => {
  const name = path.basename(file)

  if (category === "generated" && /^gen-/u.test(name)) {
    return "ai"
  }

  if (
    category === "backgrounds" ||
    category === "questions" ||
    category === "audio" ||
    (category === "avatars" && file.includes(`${path.sep}generic${path.sep}`))
  ) {
    return "theme"
  }

  return "upload"
}

const buildManifest = () => {
  const categories = ["backgrounds", "questions", "generated", "avatars", "audio"]
  const seen = new Set()
  const items = []

  for (const category of categories) {
    const dir = path.join(mediaRoot, category)

    for (const file of walkFiles(dir)) {
      const type = mediaType(file)

      if (!type) {
        continue
      }

      const rel = path.relative(path.join(mediaRoot, category), file).split(path.sep)
      const url = `/media/${category}/${rel.join("/")}`
      const baseId = safeId([category, ...rel])
      let id = baseId
      let suffix = 2

      while (seen.has(id)) {
        id = `${baseId}-${suffix}`
        suffix += 1
      }

      seen.add(id)
      items.push({
        id,
        filename: rel.join("/"),
        url,
        size: fs.statSync(file).size,
        type,
        category,
        source: sourceFor(category, file),
        uploadedAt: fs.statSync(file).mtime.toISOString(),
      })
    }
  }

  plan(`write ${manifestPath}`, () => {
    fs.writeFileSync(manifestPath, `${JSON.stringify(items, null, 2)}\n`)
  })
}

const backupConfig = () => {
  const backup = `${configRoot}.bak-${timestamp()}`

  plan(`backup ${configRoot} -> ${backup}`, () => {
    fs.cpSync(configRoot, backup, {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
  })
}

const main = () => {
  ensureConfigExists()
  backupConfig()

  for (const dir of Object.values(mediaDirs)) {
    ensureDir(dir)
  }

  moveLegacyFiles()
  rewriteTheme()
  rewriteQuizzes()
  deleteLegacyPngs()
  buildManifest()

  log("Migration plan complete.")
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
