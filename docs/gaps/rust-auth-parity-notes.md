# Rust auth — security-review notes (feed into the top-tier bughunt)

Background review of Batch 5 (manager auth) flagged 3 items. All mirror the
existing Node auth model (parity port, not Rust-introduced). Fix on BOTH twins
during the security pass to preserve parity:

1. **Spoofable session key (clientId)** — auth is keyed on client-supplied
   `auth.clientId`; a client that knows a logged manager's clientId inherits auth.
   Same as Node `loggedClients` keyed on `getClientId(socket)`. Hardening: bind
   auth to the socket/connection or issue a server-side host token. Node too.
2. **Insecure default credential** — `DEFAULT_MANAGER_PASSWORD = "PASSWORD"`
   (identical to Node). Overridable via `MANAGER_PASSWORD` env / config. Deploy
   MUST set a real password; consider refusing to start on the default.
3. **Session never revoked** — `logged_clients` had no removal. Batch 6-I adds
   MANAGER.LOGOUT + disconnect cleanup; verify it also clears on disconnect.
