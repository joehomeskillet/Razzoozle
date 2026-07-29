# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.** Instead, report security issues directly via:

- **GitHub Security Advisory:** Use the [Report a vulnerability](https://github.com/joehomeskillet/Razzoozle/security/advisories/new) button on the repository's Security tab (private, coordinated disclosure).
- **Gitea mirror (internal):** If you have access to the internal Gitea instance (git.joelduss.xyz), you may report privately there.
- **Upstream fork:** For issues in the upstream [Razzia](https://github.com/Ralex91/Razzia) project, please report to that repository.

## What to Include

When reporting a vulnerability, please provide:

1. **Description:** A clear explanation of the vulnerability and its potential impact.
2. **Steps to reproduce:** Detailed instructions to verify the issue (or a proof-of-concept if safe to share).
3. **Affected versions:** Which Razzoozle versions are impacted.
4. **Environment:** Docker / bare-metal, relevant dependencies or configuration.
5. **Your contact info:** A way to follow up (email, GitHub handle, etc.).

## Response and Coordination

- The maintainers will acknowledge your report and assess its severity as soon as possible.
- For critical issues, you can expect a response within a few days; less severe issues may take longer depending on maintainer availability.
- We will work with you to understand the issue, develop a fix, and coordinate a responsible disclosure if needed.
- Security fixes are prioritized for the latest release; backports to older versions are evaluated case-by-case.

## Supported Versions

Razzoozle follows semantic versioning. Security fixes are typically released for:

- **Latest major version (3.x):** All minor and patch releases receive timely security updates.
- **Prior major versions (2.x, 1.x):** Limited support; critical issues may be backported at maintainer discretion.

We recommend upgrading to the latest version promptly. See [CHANGELOG.md](CHANGELOG.md) for release notes and [Self-Hosting.md](docs/Self-Hosting.md) for upgrade instructions.

## Security Process

Razzoozle underwent a comprehensive security audit in July 2026 (see [`docs/security/rust-razzoozle-security-audit-2026-07-13.md`](docs/security/rust-razzoozle-security-audit-2026-07-13.md)). The project:

- Uses a Rust backend with memory-safe primitives (`axum` + `socketioxide`).
- Employs server-side authorization and input validation for all player actions.
- Rate-limits anonymous endpoints to mitigate DoS attacks.
- Runs automated tests covering security-critical paths (592+ tests).
- Follows GitHub Security Advisory best practices for coordinated disclosure.

## Scope

Security coverage includes:

- **In scope:** Rust backend (gameplay, manager API, auth), React web client, Socket.IO protocol, deployment defaults.
- **Out of scope:** Self-hosting operational security (TLS setup, database hardening, network isolation) — these are the deployer's responsibility. See [Self-Hosting.md](docs/Self-Hosting.md) for hardening recommendations.

## Code of Conduct

Please report vulnerabilities in good faith. Avoid public disclosure, social media posts, or demonstrations against live instances without prior coordination. Good-faith security researchers who follow responsible disclosure will not face legal action.

## Questions?

For non-security questions or clarifications, open a regular issue on [GitHub Issues](https://github.com/joehomeskillet/Razzoozle/issues) or check the [Docs](docs/).
