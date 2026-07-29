# ADR-004 — Documentation Source of Truth

**Date:** 2026-07-29  
**Status:** angenommen  
**Tags:** architecture, documentation, governance

---

## Context

Razzoozle has grown a distributed documentation system with overlapping content across multiple files and directories. The project now contains:

- **Root project files:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `design.md`, `rust/README.md`
- **Detailed docs:** `docs/` with subdirectories (design, sdd, planning, containers, etc.)
- **Operational state:** `.claude/state/` (DECISIONS.md, HANDOFF.md, TASK.md, task-specific kickoffs)
- **Project README:** `docs/README.md`

### Current Overlaps & Redundancies

1. **Commands duplicated:** `pnpm` scaffolding, build, and verification commands appear in both `AGENTS.md` (lines 16–44) and `CLAUDE.md` (entire section 2), causing maintenance burden and divergence risk.
2. **Architecture split:** Component architecture and crate layout are described in `AGENTS.md` (§Architecture Map) and `rust/README.md` separately, with no clear delineation of what each covers.
3. **Stale gotchas:** `AGENTS.md` (§Gotchas) contains some entries (e.g., gitignored files) that are session-specific and would be better housed in operational documentation or CI/script comments.
4. **No taxonomy for `docs/`:** Subdirectories (`design/`, `sdd/`, `planning/`, etc.) lack a published classification; new docs are added ad-hoc without a clear place to live.
5. **Design system authority:** `design.md` (root) explicitly marks itself as canonical (line 3), but related design specs live in `docs/design/` without a clear relationship.

### What Is Currently Canonical

1. **`design.md`** — Explicitly marked as "Canonical design-system reference" (line 3). This is the source of truth for all UI/color/token decisions.
2. **`AGENTS.md`** — De facto canonical for project architecture and developer onboarding, but without explicit declaration.
3. **`README.md`** — Primary public-facing entry point (links to docs and lists features).
4. **`.claude/state/DECISIONS.md`** — Records architectural decisions made during active development, but is session-operational, not permanent project doctrine.

---

## Decision

**Documentation is organized in a four-tier hierarchy:**

### Tier 1: Entry Points (Project Governance & Entry)

These files define what Razzoozle is and how to work on it. **Read first.**

| File | Scope | Canonical For |
|------|-------|-------|
| `README.md` | Public identity, quick start, features | What Razzoozle is; links to all docs |
| `AGENTS.md` | Project architecture, dev workflow, key commands | Component layout, architecture, developer command reference |
| `design.md` | Design system rules, tokens, guardrails | All UI/color/styling decisions; explicitly canonical |
| `CLAUDE.md` | Command reference, UI governance rules | Developer cheat sheet for commands and mandatory UI rules |

**Single-source rule:** Command lists live in `AGENTS.md` (§Key Commands) only. `CLAUDE.md` links to or excerpts with a pointer to `AGENTS.md` as the source.

### Tier 2: Reference & Detailed Docs (`docs/` Directory)

Organized by topic. Each subdirectory has a clear purpose.

| Subdirectory | Purpose | Example Files |
|---|---|---|
| `docs/design/` | Design feature specs, component specs, UI design docs | Feature specs, SDD extensions for UI, token validation docs |
| `docs/sdd/` | Software Design Documents — formal specs for major features | Game flow specs, architecture refinements, schema docs |
| `docs/containers/` | Deployment & containerization | Docker build notes, health checks, migrations |
| `docs/planning/` | Session planning & kickoff material | Feature breakdowns, session start prompts, wave plans |
| `docs/research/` | Research, analysis, investigations | Performance notes, security audits, gap analyses |
| `docs/security/` | Security & compliance | CVE notes, threat modeling, auth specs |
| `docs/`: Top-level | Core user docs | Self-Hosting.md, Configuration.md, Theming.md, LOW-LATENCY-MODE.md |

**Non-negotiables:**
- `Self-Hosting.md`, `Configuration.md`, `Theming.md`, `LOW-LATENCY-MODE.md` live in `docs/` (not subdirs) — they are user-facing and linked from root `README.md`.
- `docs/README.md` is the **internal wiki index** (different from root `README.md`; describes what's in `docs/`).
- **No duplication:** If topic X is covered in `docs/design/foo.md`, it must not also appear in `docs/sdd/foo.md`. Link instead.

### Tier 3: Rust-Specific Architecture (`rust/README.md`)

- Rust-specific build, test, performance, and crate layout documentation
- Must not duplicate Node/TS architecture from `AGENTS.md` (cross-reference instead)
- Covers Rust internals only; does not duplicate game logic architecture (that lives in `AGENTS.md` §Architecture Map)

### Tier 4: Operational State (`.claude/state/`)

**Session-temporary, not permanent project doctrine.**

| File | Purpose | Lifecycle |
|---|---|---|
| `DECISIONS.md` | Record of architectural decisions made during sessions | Permanent; seeded at session start, appended with decisions |
| `HANDOFF.md` | Handoff information between agents/sessions | Temporary; refreshed per handoff |
| `TASK.md` | Current active task/goal | Temporary; reset with each task |
| `*KICKOFF*.md`, `*SPEC*.md` | Session-specific specs, wave plans, breakdowns | Temporary; archived or discarded after session |

**None of these are canonical references** — they are working memory. References to permanent doctrine must link to Tier 1 or Tier 2 docs instead.

---

## Deduplication & Migration Plan

### Immediate (This ADR)

1. Mark the four Tier 1 files as canonical entry points (this ADR serves as documentation).
2. Audit `CLAUDE.md` for command duplication; change all command references to link to `AGENTS.md` §Key Commands.
3. Update `AGENTS.md` §Architecture Map with a cross-reference to `rust/README.md` for Rust-specific details.

### Short-term (Next 1–2 sessions)

1. Audit `AGENTS.md` §Gotchas; move session-temporary gotchas to `.claude/state/` or remove if stale.
2. Create `docs/README.md` as a table of contents for `docs/` subdirectories (if it doesn't already exist with this structure).
3. Ensure every new document added to `docs/` specifies which Tier 2 subdirectory it belongs in.

### Medium-term (Design/SDD updates)

1. When updating design specs: publish feature-wide decisions as new `.md` files in `docs/design/`, and cross-link from `design.md` where relevant.
2. When creating new SDDs: place them in `docs/sdd/`, with a summary link or reference in `docs/README.md`.

---

## Consequences

### Benefits

- **Single source of truth for each topic:** Reduces maintenance burden and divergence risk.
- **Clear entry points:** Developers know to start with Tier 1 files (`AGENTS.md`, `design.md`).
- **Operational docs stay flexible:** Session kickoffs and task specs can evolve without polluting permanent project documentation.
- **Scalable structure:** New topics fit clearly into Tier 2 subdirectories; no unclear intermediate places.

### Costs

- **One-time audit:** Existing docs must be reviewed to identify stale content and duplicates.
- **Link hygiene discipline:** Contributors must check for existing coverage before creating new docs (breaking this will be visible as Tier 2 drift in future audits).
- **CLAUDE.md changes:** Some users may have bookmarked `CLAUDE.md` for commands; the change to link-only requires communication.

---

## Rationale

1. **Entry points must be few and canonical:** `AGENTS.md` and `design.md` are already de facto canonical; this ADR formalizes that and adds `README.md` and `CLAUDE.md` as peers.
2. **Commands live once:** Copy-paste maintenance overhead is eliminated by housing commands in one place (`AGENTS.md`) with cross-references everywhere else.
3. **Rust architecture has boundaries:** `rust/README.md` covers Rust implementation details; Node/game logic architecture stays in `AGENTS.md` to avoid duplication across two languages.
4. **Operational docs are temporary:** `.claude/state/` is working memory for sessions, not permanent reference material; it must not compete with Tier 1/2 docs.
5. **Scalability:** As the project grows, a clear Tier 2 taxonomy prevents docs from accumulating in arbitrary places.

---

## Alternatives Considered

### A. "Single docs.md file for everything"
Too coarse; developers need multiple entry points for different audiences (public, developers, architects).

### B. "Wiki (Gitea/GitHub Pages)"
Over-engineered for current scope; in-repo Markdown is sufficient. Revisit if docs grow beyond ~150 files.

### C. "Tier 1 files disappear, everything lives in docs/"
Creates friction: `docs/README.md` becomes the only entry point, but developers expect `AGENTS.md` in root and design rules in `design.md`.

### D. "Session-operational docs (DECISIONS.md, HANDOFF.md) migrate to Tier 2"
Creates noise in permanent reference material. Mixing working-memory with doctrine confuses both. Better to keep them separate and link where doctrine needs historical context.

---

## Status

**Accepted.** Formalizes the current de facto structure and provides a clear hierarchy for future growth. Implementation (deduplication) is a separate, optional effort; this ADR stands as governance independent of cleanup progress.
