# Environment Configuration Reference

This document describes all environment variables supported by the Razzoozle server.

The `.env.example` file in the repository root contains the authoritative list of environment variables with example values. Copy this file to `.env` and fill in appropriate values for your deployment.

## Secret Management Pattern

Many sensitive variables support a `*_FILE` suffix to read values from files instead of directly from the environment:

```bash
# Pattern: VARIABLE_NAME_FILE=/path/to/secret
# Example: instead of MANAGER_PASSWORD=secret123
MANAGER_PASSWORD_FILE=/run/secrets/manager_password
```

When a `*_FILE` variable is set:
1. The file is read, and any trailing newline is automatically removed
2. The value becomes available to the application
3. If both `VARIABLE_NAME` and `VARIABLE_NAME_FILE` are set, an error is returned (fail-safe)

This pattern is particularly useful for containerized deployments (Docker, Kubernetes) where secrets are mounted as files.

**Reference implementation**: `rust/server/src/config/config_secret.rs`

---

## DATABASE

### DATABASE_URL

**Description**: PostgreSQL connection string for database operations and migrations.

**Example**: `postgresql://username:password@localhost:5432/razzoozle`

**Supports**: `DATABASE_URL_FILE`

**Required**: Yes

**Default**: None (must be set)

Used for all database connections, including the embedded SQLx migration runner.

---

## SERVER & NETWORK

### PORT

**Description**: HTTP server bind port. Server binds to `0.0.0.0` for Docker port forwarding compatibility.

**Example**: `3020`

**Supports**: Direct environment variable only

**Required**: No

**Default**: `3020`

### CONFIG_PATH

**Description**: Absolute or relative path to the configuration directory (contains `game.json`, `config.toml`, etc.).

**Example**: `/etc/razzoozle/config` or `./config`

**Supports**: Direct environment variable only

**Required**: No

**Default**: `./config` (relative to server working directory)

If unset, the server looks for configuration files relative to the current working directory.

### WEB_DIST

**Description**: Path to compiled web SPA assets (frontend build output).

**Example**: `/app/web` or `/usr/local/razzoozle/web`

**Supports**: Direct environment variable only

**Required**: No (has built-in fallback paths)

**Default**: Automatic detection
- Production Docker: `/app/web`
- Development: `packages/web/dist`

If unset, the server attempts to locate web assets in standard locations.

---

## SECURITY & AUTHENTICATION

### AI_KEY_ENCRYPTION_KEY

**Description**: Encryption passphrase for user AI provider keys (OpenAI, Claude, etc.) stored encrypted in the database using PostgreSQL's `pgp_sym_encrypt` function.

**Example**: A strong key, minimum 20 characters (actual value not shown for security)

**Supports**: `AI_KEY_ENCRYPTION_KEY_FILE`

**Required**: Yes (if users are allowed to set external AI provider keys)

**Default**: None (must be set if AI key management is enabled)

Users can configure their own external AI provider keys in the application; these are encrypted at rest using this passphrase.

### SATELLITE_TOKEN

**Description**: Optional authentication token for external satellite services or integrations.

**Example**: Not shown (secret value)

**Supports**: `SATELLITE_TOKEN_FILE`

**Required**: No

**Default**: Unset (satellite authentication disabled)

If set, enables satellite mode for incoming connections authenticated with this token.

### MANAGER_PASSWORD

**Description**: Display password for manager to control the game from a separate terminal or device (e.g., for show control, game progression).

**Example**: Not shown (secret value)

**Supports**: `MANAGER_PASSWORD_FILE`

**Required**: No (has a default, but default is a security no-op)

**Default**: `PASSWORD` (if unset; this is a sentinel value that fails authentication)

For production, always set an actual password. The default sentinel ensures the manager interface cannot be accessed unintentionally.

### BOOTSTRAP_ADMIN_USER

**Description**: Username for creating the initial admin account on first run with an empty database.

**Example**: `admin`

**Supports**: Direct environment variable only

**Required**: No (but `BOOTSTRAP_ADMIN_PASSWORD` must also be set)

**Default**: Unset (no bootstrap)

**Note**: Bootstrap only occurs if:
- Both `BOOTSTRAP_ADMIN_USER` and `BOOTSTRAP_ADMIN_PASSWORD` are set
- The database has zero users (empty state)
- Is idempotent — subsequent starts do nothing if users already exist

### BOOTSTRAP_ADMIN_PASSWORD

**Description**: Password for the bootstrap admin account (pairs with `BOOTSTRAP_ADMIN_USER`).

**Example**: Not shown (secret value)

**Supports**: `BOOTSTRAP_ADMIN_PASSWORD_FILE` (recommended for production)

**Required**: No (but `BOOTSTRAP_ADMIN_USER` must also be set)

**Default**: Unset

Must be set together with `BOOTSTRAP_ADMIN_USER` to enable admin account creation.

### DEV_API_KEY

**Description**: Authentication key for protected developer API endpoints.

**Example**: Not shown (secret value)

**Supports**: `DEV_API_KEY_FILE`

**Required**: No (only used when `RAZZOOLE_DEV=1`)

**Default**: Unset

Only has an effect when development mode is enabled. Used to guard experimental or debug endpoints.

---

## DEVELOPMENT & DEBUGGING

### RAZZOOLE_DEV

**Description**: Enable development mode (relaxes security checks, enables dev-only endpoints).

**Example**: `1`

**Supports**: Direct environment variable only

**Required**: No

**Default**: Unset (production mode)

**Note**: Set to any non-empty value to activate. Commonly set to `1`. When enabled, allows use of `DEV_API_KEY` and exposes additional debugging endpoints.

### RAHOOT_SIM_MODE

**Description**: Enable simulation mode for testing with player bots (automated players).

**Example**: `1`

**Supports**: Direct environment variable only

**Required**: No

**Default**: Unset (disabled)

When enabled, the `/sim_players` manager command becomes available to add bot players for testing game flow.

---

## EXTERNAL SERVICES: ComfyUI

These variables configure integration with ComfyUI for AI-powered image generation (text-to-image and sketch-to-image workflows).

### COMFYUI_URL

**Description**: HTTP endpoint URL for the ComfyUI image generation service.

**Example**: `http://127.0.0.1:8188` (local), `https://comfyui.example.com` (remote)

**Supports**: Direct environment variable only

**Required**: No (uses default if unset)

**Default**: `http://127.0.0.1:8188`

### COMFYUI_WORKFLOW

**Description**: Path to ComfyUI txt2img (text-to-image) workflow JSON file.

**Example**: `./workflows/txt2img-zimage-turbo.json`

**Supports**: Direct environment variable only

**Required**: No (uses default if unset)

**Default**: `./workflows/txt2img-zimage-turbo.json`

**Note**: Path is relative to the server working directory.

### COMFYUI_IMG2IMG_WORKFLOW

**Description**: Path to ComfyUI img2img (image-to-image / sketch-to-image) workflow JSON file.

**Example**: `./workflows/sketch2img-zimage-turbo.json`

**Supports**: Direct environment variable only

**Required**: No (uses default if unset)

**Default**: `./workflows/sketch2img-zimage-turbo.json`

**Note**: Path is relative to the server working directory.

---

## Usage Examples

### Local Development

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/razzoozle
PORT=3020
RAZZOOLE_DEV=1
DEV_API_KEY=my-dev-key-for-testing
```

### Docker Deployment (using Docker secrets)

```bash
DATABASE_URL_FILE=/run/secrets/db_url
MANAGER_PASSWORD_FILE=/run/secrets/manager_password
AI_KEY_ENCRYPTION_KEY_FILE=/run/secrets/ai_key_encryption_key
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASSWORD_FILE=/run/secrets/admin_password
```

### Production (Kubernetes with mounted secrets)

```bash
DATABASE_URL_FILE=/etc/secrets/database-url
MANAGER_PASSWORD_FILE=/etc/secrets/manager-password
AI_KEY_ENCRYPTION_KEY_FILE=/etc/secrets/ai-encryption-key
BOOTSTRAP_ADMIN_PASSWORD_FILE=/etc/secrets/admin-password
COMFYUI_URL=https://comfyui.internal.example.com
```

---

## See Also

- `.env.example` — Template with all variables and example values
- `docs/development/README.md` — Local setup and development gates
- `docs/operations/migrations.md` — Database migration procedures
