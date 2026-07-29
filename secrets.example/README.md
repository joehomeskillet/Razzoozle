# Secrets for `docker-compose.yaml` (WP DCK-09)

These files are **placeholders only** — never real secrets. To run the
hardened stack:

```bash
mkdir -p .secrets
cp secrets.example/database_url.example            .secrets/database_url
cp secrets.example/postgres_password.example        .secrets/postgres_password
cp secrets.example/ai_key_encryption_key.example    .secrets/ai_key_encryption_key
cp secrets.example/bootstrap_admin_password.example .secrets/bootstrap_admin_password
```

Then edit the files under `.secrets/` with real values. `.secrets/` is
already gitignored (see `.gitignore`) — it never gets committed.

`database_url` must reference the `postgres_password` value, e.g.:

```
postgresql://razzoozle:<same value as .secrets/postgres_password>@db:5432/razzoozle
```

The server reads these via the `*_FILE` env-var pattern implemented in
`rust/server/src/config/config_secret.rs` (`DATABASE_URL_FILE`,
`POSTGRES_PASSWORD_FILE`, `AI_KEY_ENCRYPTION_KEY_FILE`,
`BOOTSTRAP_ADMIN_PASSWORD_FILE`) — no secret ever appears in
`docker-compose.yaml` itself.
