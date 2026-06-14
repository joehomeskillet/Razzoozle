// AI provider API keys live HERE and only here. They are stored in
// config/ai-secrets.json (a flat Record<providerId, string>) with file mode
// 0600 so only the server user can read them. A key NEVER travels over the
// socket and is NEVER logged — the client only ever learns a `keyConfigured`
// boolean (see toPublicAISettings in services/config). The file path is derived
// the same way as the rest of the config layer and every provider id is run
// through assertSafeId before it touches a path or a record key.
import { assertSafeId } from "@razzia/socket/services/config"
import fs from "fs"
import { resolve } from "path"

const inContainerPath = process.env.CONFIG_PATH

const getPath = (path = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

const SECRETS_FILE = "ai-secrets.json"

type SecretsRecord = Record<string, string>

const readSecrets = (): SecretsRecord => {
  const filePath = getPath(SECRETS_FILE)

  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SecretsRecord
    }

    return {}
  } catch {
    // Never throw on a malformed secrets file — treat it as "no keys".
    return {}
  }
}

const writeSecrets = (secrets: SecretsRecord): void => {
  const filePath = getPath(SECRETS_FILE)

  // Write then tighten perms to 0600 (owner read/write only). NEVER log the
  // contents — this file holds plaintext API keys.
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2))
  fs.chmodSync(filePath, 0o600)
}

export const getKey = (id: string): string | undefined => {
  assertSafeId(id)

  const key = readSecrets()[id]

  return typeof key === "string" && key.length > 0 ? key : undefined
}

export const hasKey = (id: string): boolean => {
  assertSafeId(id)

  return getKey(id) !== undefined
}

// Set a provider's key. A null/empty/whitespace key CLEARS the stored entry.
export const setKey = (id: string, key: string | null): void => {
  assertSafeId(id)

  const secrets = readSecrets()
  const trimmed = key?.trim()

  if (!trimmed) {
    delete secrets[id]
  } else {
    secrets[id] = trimmed
  }

  writeSecrets(secrets)
}
