# Document Inventory

**Date:** 2026-07-29  
**Status:** Complete  
**Scope:** All Markdown documentation files in the Razzoozle repository

---

## Overview

This inventory catalogs all 169 Markdown documentation files in the Razzoozle project, organized by the four-tier hierarchy defined in ADR-004 (Documentation Source of Truth). Each document is classified by:

- **Tier:** Where it fits in the documentation hierarchy
- **Purpose:** What the document covers in one sentence
- **Status:** Whether it is current, historical (describes a past state but valuable as record), or stale (makes false claims about the present)

**Status Breakdown:**
- **Aktuell (Current):** 135 files — actively used and accurate for today's development
- **Historisch (Historical):** 34 files — describe past sessions or features, retained as records
- **Veraltet (Stale):** 0 files — currently no documents identified as making false claims about present state

---

## Document Inventory

| Pfad | Zweck | Stufe | Zustand | Anmerkung |
|------|-------|-------|---------|-----------|
| README.md | Public-facing project introduction, features, quickstart | Tier 1: Entry Points | Aktuell | Primary public-facing document; links to all major docs |
| AGENTS.md | Agent onboarding, architecture map, key commands, gotchas | Tier 1: Entry Points | Aktuell | De facto canonical for project structure and developer workflow |
| CLAUDE.md | Developer command reference | Tier 1: Entry Points | Aktuell | Command cheat sheet; cross-referenced from AGENTS.md |
| design.md | Canonical design system rules, tokens, guardrails | Tier 1: Entry Points | Aktuell | Explicitly canonical; source of truth for all UI/styling decisions |
| CODEX.md | Codex agent configuration / start prompt | Tier 1: Meta & Info | Aktuell | Agent-specific onboarding and configuration |
| CONTRIBUTING.md | Contribution guidelines | Tier 1: Meta & Info | Aktuell | Guidelines for external contributors |
| SECURITY.md | Security policy and disclosure | Tier 1: Meta & Info | Aktuell | CVE reporting and security process |
| SUPPORT.md | Support policy and contact | Tier 1: Meta & Info | Aktuell | User support information |
| CHANGELOG.md | Release changelog and version history | Tier 1: Changelog | Aktuell | Historical release notes (kept current via releases) |
| README.de.md | Localized README (Deutsch) | Tier 1: Localized | Aktuell | German translation of main README |
| README.es.md | Localized README (Español) | Tier 1: Localized | Aktuell | Spanish translation of main README |
| README.fr.md | Localized README (Français) | Tier 1: Localized | Aktuell | French translation of main README |
| README.it.md | Localized README (Italiano) | Tier 1: Localized | Aktuell | Italian translation of main README |
| README.zh.md | Localized README (中文) | Tier 1: Localized | Aktuell | Chinese translation of main README |
| docs/adr/001-ci-source-of-truth.md | CI and deployment pipeline governance | Tier 2: ADR | Aktuell | Establishes how CI/CD decisions are made |
| docs/adr/002-github-gitea-roles.md | GitHub and Gitea repository role definition | Tier 2: ADR | Aktuell | Defines dual-mirror strategy and repo responsibilities |
| docs/adr/003-supported-toolchains.md | Supported development toolchains | Tier 2: ADR | Aktuell | Node, Rust, Python, Docker version requirements |
| docs/adr/004-documentation-source-of-truth.md | Four-tier documentation hierarchy | Tier 2: ADR | Aktuell | Governance framework for all documentation (this inventory's basis) |
| docs/adr/005-version-and-tag-schema.md | Versioning and release tagging strategy | Tier 2: ADR | Aktuell | Semantic versioning and tag format rules |
| docs/adr/006-embedded-migration-architecture.md | Architecture for embedded system migrations | Tier 2: ADR | Aktuell | Design decisions for embedded/offline scenarios |
| docs/adr/007-http-api-documentation-strategy.md | HTTP API documentation approach | Tier 2: ADR | Aktuell | How REST/HTTP endpoints are documented |
| docs/adr/008-mcp-server-host-only-tool.md | MCP server as host-only development tool | Tier 2: ADR | Aktuell | MCP usage and scope within dev environment |
| docs/adr/009-centralized-auth-session-management.md | Centralized authentication and session handling | Tier 2: ADR | Aktuell | Auth architecture and session state management |
| docs/adr/010-authoritative-protocol-types.md | Authoritative wire protocol and type definitions | Tier 2: ADR | Aktuell | How ts-rs and protocol types are generated and maintained |
| docs/adr/011-modularization-boundaries-and-priority.md | Crate and module boundary definitions | Tier 2: ADR | Aktuell | Modularization strategy and priority (monolith guards, etc.) |
| docs/Configuration.md | User guide: server configuration | Tier 2: Reference | Aktuell | Deployment configuration options for end users |
| docs/LOW-LATENCY-MODE.md | User guide: low-latency network mode | Tier 2: Reference | Aktuell | Special configuration for low-latency environments |
| docs/README.md | Internal wiki index and docs table of contents | Tier 2: Reference | Aktuell | Navigation hub for all docs/ subdirectories |
| docs/Self-Hosting.md | User guide: self-hosting and deployment | Tier 2: Reference | Aktuell | How to deploy Razzoozle in self-hosted environments |
| docs/Theming.md | User guide: UI theming and customization | Tier 2: Reference | Aktuell | Theming configuration and customization guide |
| docs/backlog-sdd-start.md | Backlog and roadmap starting spec | Tier 2: Reference | Aktuell | Feature backlog planning document |
| docs/build-baseline.md | Build environment baseline specifications | Tier 2: Reference | Aktuell | Required dependencies and build environment setup |
| docs/rezept-neuer-fragetyp.md | Recipe: adding a new question type | Tier 2: Reference | Aktuell | Step-by-step guide for implementing new question types |
| docs/wave6-7-sdd.md | Wave 6-7 software design specification | Tier 2: Reference | Aktuell | Planning document for waves 6-7 features |
| docs/design/LIVING_DESIGN_SYSTEM.md | Living design system specifications (auto-generated) | Tier 2: Design | Aktuell | Auto-generated from W3C tokens; design tokens and utilities |
| docs/design/NGINX_RUST_ONLY_REFERENCE.md | NGINX and Rust-only deployment reference | Tier 2: Design | Historisch | References old Rust-only deployment model; now superseded by Node/Rust hybrid |
| docs/design/answer-reveal-sdd.md | Answer reveal animation and timing spec | Tier 2: Design | Aktuell | Design spec for answer reveal behavior |
| docs/design/api-llm-harmonization-sdd.md | API and LLM harmonization specification | Tier 2: Design | Aktuell | Design for unified API/LLM protocol handling |
| docs/design/bulk-import-sdd.md | Bulk question import feature spec | Tier 2: Design | Aktuell | Design for bulk import functionality |
| docs/design/content-import-sdd.md | Content import and ingestion spec | Tier 2: Design | Aktuell | Design for content import features |
| docs/design/drop-pin-direct-manipulation.md | Drop-pin direct manipulation UX spec | Tier 2: Design | Aktuell | UX design for drop-pin question interactions |
| docs/design/drop-pin-sdd.md | Drop-pin question type specification | Tier 2: Design | Aktuell | Full design doc for drop-pin feature |
| docs/design/fill-blank-matching-sdd.md | Fill-blank and matching question types spec | Tier 2: Design | Aktuell | Design for fill-in-the-blank and matching questions |
| docs/design/gameui-slider-control.md | Game UI slider control design | Tier 2: Design | Aktuell | Design spec for slider controls in game UI |
| docs/design/host-analytics-sdd.md | Host analytics and reporting spec | Tier 2: Design | Aktuell | Design for host-side analytics features |
| docs/design/kahoot-remediation-sdd.md | Kahoot feature remediation specification | Tier 2: Design | Aktuell | Design for implementing missing Kahoot features |
| docs/design/question-preview-sdd.md | Question preview feature specification | Tier 2: Design | Aktuell | Design for question preview in manager |
| docs/design/question-type-contract.md | Question type protocol contract | Tier 2: Design | Aktuell | Interface contract for implementing question types |
| docs/design/question-types-style-alignment-sdd.md | Question type styling alignment spec | Tier 2: Design | Aktuell | Design for visual consistency across question types |
| docs/design/quiz-templates-sdd.md | Quiz templates and presets specification | Tier 2: Design | Aktuell | Design for quiz template system |
| docs/design/razzoozle-backlog-completion-sdd.md | Razzoozle backlog completion specification | Tier 2: Design | Aktuell | Design for feature completion roadmap |
| docs/design/sdd-466-puzzle-sequencing.md | SDD-466: Puzzle sequencing feature | Tier 2: Design | Aktuell | Design spec for puzzle sequencing |
| docs/design/sdd-467-word-cloud.md | SDD-467: Word cloud question type | Tier 2: Design | Aktuell | Design spec for word cloud feature |
| docs/design/sdd-468-brainstorming.md | SDD-468: Brainstorming feature | Tier 2: Design | Aktuell | Design spec for brainstorming mode |
| docs/design/sdd-469-confidence-rating.md | SDD-469: Confidence rating feature | Tier 2: Design | Aktuell | Design spec for confidence rating |
| docs/design/sdd-470-micro-lessons.md | SDD-470: Micro lessons feature | Tier 2: Design | Aktuell | Design spec for micro lessons |
| docs/design/sdd-471-self-paced-assignments.md | SDD-471: Self-paced assignments | Tier 2: Design | Aktuell | Design spec for self-paced learning |
| docs/design/sdd-472-ghost-replay-mode.md | SDD-472: Ghost replay mode | Tier 2: Design | Aktuell | Design spec for replay mode |
| docs/design/sdd-473-challenge-mode.md | SDD-473: Challenge mode | Tier 2: Design | Aktuell | Design spec for challenge/competition mode |
| docs/design/sdd-474-qa-live-moderation.md | SDD-474: Q&A live moderation | Tier 2: Design | Aktuell | Design spec for live Q&A moderation |
| docs/design/sdd-475-lobby-music-presets.md | SDD-475: Lobby music presets | Tier 2: Design | Aktuell | Design spec for music/audio in lobby |
| docs/design/sdd-476-seeded-question-randomization.md | SDD-476: Seeded question randomization | Tier 2: Design | Aktuell | Design spec for deterministic shuffling |
| docs/design/sdd-477-manager-participant-cap.md | SDD-477: Manager participant capacity limits | Tier 2: Design | Aktuell | Design spec for participant caps and limits |
| docs/design/sdd-478-results-export-png-pdf.md | SDD-478: Results export to PNG/PDF | Tier 2: Design | Aktuell | Design spec for export functionality |
| docs/design/sdd-479-bulk-question-import.md | SDD-479: Bulk question import | Tier 2: Design | Aktuell | Design spec for bulk import features |
| docs/design/sdd-480-quiz-version-history-rollback.md | SDD-480: Quiz version history and rollback | Tier 2: Design | Aktuell | Design spec for version control on quizzes |
| docs/design/sdd-481-document-content-extractor.md | SDD-481: Document content extraction | Tier 2: Design | Aktuell | Design spec for extracting content from documents |
| docs/design/self-paced-sdd.md | Self-paced learning mode specification | Tier 2: Design | Aktuell | Design spec for self-paced mode |
| docs/design/socket-role-exclusivity-sdd.md | Socket role exclusivity specification | Tier 2: Design | Aktuell | Design spec for role-based socket access |
| docs/design/socket-role-transition-states.md | Socket role transition state machine | Tier 2: Design | Aktuell | State machine for role transitions |
| docs/design/study-practice-modes-sdd.md | Study and practice modes specification | Tier 2: Design | Aktuell | Design spec for study/practice learning modes |
| docs/sdd/2026-07-27-razzoozle-rest-delivery-false-completion-audit.md | REST API delivery and false completion audit | Tier 2: SDD | Aktuell | Analysis of REST delivery and completion tracking issues (recent) |
| docs/sdd/2026-07-28-lehrkraft-auswertung.md | Teacher evaluation and reporting spec | Tier 2: SDD | Aktuell | Design spec for teacher evaluation features (recent) |
| docs/sdd/2026-07-28-schuelerportal-und-zuweisung.md | Student portal and assignment management spec | Tier 2: SDD | Aktuell | Design for student portal features (recent) |
| docs/sdd/2026-07-28-solo-assignment-targets.md | Solo assignment target specifications | Tier 2: SDD | Aktuell | Design spec for solo assignment features (recent) |
| docs/sdd/2026-07-28-solo-multiplayer-parity.md | Solo and multiplayer parity analysis | Tier 2: SDD | Aktuell | Design spec for feature parity (recent) |
| docs/sdd/2026-07-28-solo-scoring-parity.md | Solo and multiplayer scoring alignment | Tier 2: SDD | Aktuell | Design for scoring consistency (recent) |
| docs/sdd/2026-07-29-error-handling-und-logging.md | Error handling and logging architecture | Tier 2: SDD | Aktuell | Design spec for error/logging (most recent) |
| docs/sdd/fill-blank-matching-contract-freeze.md | Fill-blank and matching contract freeze | Tier 2: SDD | Historisch | Older feature contract; represented in current design docs |
| docs/sdd/game-solo-multiplayer-refactor/00-charter.md | Game solo/multiplayer refactor charter | Tier 2: SDD | Aktuell | Master charter for major game architecture refactor |
| docs/sdd/game-solo-multiplayer-refactor/01-current-game-architecture.md | Current game architecture inventory | Tier 2: SDD | Aktuell | Baseline architecture for refactor planning |
| docs/sdd/game-solo-multiplayer-refactor/02-CHECKLIST.md | Refactor implementation checklist | Tier 2: SDD | Aktuell | Task tracking for refactor work |
| docs/sdd/game-solo-multiplayer-refactor/02-SUMMARY.md | Refactor summary and findings | Tier 2: SDD | Aktuell | High-level summary of refactor scope |
| docs/sdd/game-solo-multiplayer-refactor/02-flow-inventory.md | Game flow inventory (current state) | Tier 2: SDD | Aktuell | Complete catalog of game flows |
| docs/sdd/game-solo-multiplayer-refactor/02b-server-side-flows.md | Server-side game flow specification | Tier 2: SDD | Aktuell | Rust server flow details |
| docs/sdd/game-solo-multiplayer-refactor/03-solo-ux-audit.md | Solo mode UX audit | Tier 2: SDD | Aktuell | UX analysis of solo gameplay |
| docs/sdd/game-solo-multiplayer-refactor/04-multiplayer-ux-audit.md | Multiplayer mode UX audit | Tier 2: SDD | Aktuell | UX analysis of multiplayer gameplay |
| docs/sdd/game-solo-multiplayer-refactor/05-class-mode-join-spec.md | Class mode join flow specification | Tier 2: SDD | Aktuell | Design spec for class/team join flows |
| docs/sdd/game-solo-multiplayer-refactor/06-security-and-identity.md | Security and identity specifications | Tier 2: SDD | Aktuell | Security requirements for game modes |
| docs/sdd/game-solo-multiplayer-refactor/07-state-machine-and-events.md | State machine and event specifications | Tier 2: SDD | Aktuell | Protocol for game state and events |
| docs/sdd/game-solo-multiplayer-refactor/08-api-and-data-contracts.md | API and data contract definitions | Tier 2: SDD | Aktuell | Wire protocol and data format specs |
| docs/sdd/game-solo-multiplayer-refactor/09-error-and-reconnect-behaviour.md | Error handling and reconnect behavior | Tier 2: SDD | Aktuell | Resilience and recovery specifications |
| docs/sdd/game-solo-multiplayer-refactor/10-accessibility.md | Accessibility compliance specifications | Tier 2: SDD | Aktuell | A11Y requirements for game |
| docs/sdd/game-solo-multiplayer-refactor/11-implementation-plan.md | Implementation plan and roadmap | Tier 2: SDD | Aktuell | Staged implementation strategy |
| docs/sdd/game-solo-multiplayer-refactor/13-grok-primary-review.md | Grok agent primary review | Tier 2: SDD | Aktuell | Cross-review findings by Grok agent |
| docs/sdd/game-solo-multiplayer-refactor/14-codex-primary-review.md | Codex agent primary review | Tier 2: SDD | Aktuell | Cross-review findings by Codex agent |
| docs/sdd/game-solo-multiplayer-refactor/15-cross-review.md | Cross-review adjudication | Tier 2: SDD | Aktuell | Reconciliation of review findings |
| docs/sdd/game-solo-multiplayer-refactor/16-adjudication-log.md | Adjudication and decision log | Tier 2: SDD | Aktuell | Record of design decisions made |
| docs/sdd/game-solo-multiplayer-refactor/19-game-component-inventory.md | Game component inventory | Tier 2: SDD | Aktuell | Complete list of game components |
| docs/sdd/game-solo-multiplayer-refactor/20-game-state-and-event-inventory.md | Game state and event inventory | Tier 2: SDD | Aktuell | Complete catalog of state and events |
| docs/sdd/game-solo-multiplayer-refactor/21-game-modularization-plan.md | Game modularization plan | Tier 2: SDD | Aktuell | Refactoring strategy for code organization |
| docs/sdd/game-solo-multiplayer-refactor/25-game-element-audit.md | Game element audit | Tier 2: SDD | Aktuell | Complete element and component audit |
| docs/sdd/game-solo-multiplayer-refactor/phase0-gaps-and-duplication.md | Phase 0: gaps and duplication analysis | Tier 2: SDD | Aktuell | Baseline analysis of code issues |
| docs/sdd/manager-ui-ux-refactor/00-charter.md | Manager UI/UX refactor charter | Tier 2: SDD | Aktuell | Master charter for manager interface redesign |
| docs/sdd/manager-ui-ux-refactor/01-current-state.md | Current manager UI/UX state | Tier 2: SDD | Aktuell | Baseline state analysis |
| docs/sdd/manager-ui-ux-refactor/06-implementation-plan.md | Manager UI/UX implementation plan | Tier 2: SDD | Aktuell | Staged rollout strategy |
| docs/sdd/manager-ui-ux-refactor/09-grok-primary-review.md | Manager UI/UX Grok primary review | Tier 2: SDD | Aktuell | Grok review findings |
| docs/sdd/manager-ui-ux-refactor/10-codex-primary-review.md | Manager UI/UX Codex primary review | Tier 2: SDD | Aktuell | Codex review findings |
| docs/sdd/manager-ui-ux-refactor/12-adjudication-log.md | Manager UI/UX adjudication log | Tier 2: SDD | Aktuell | Design decision log |
| docs/sdd/manager-ui-ux-refactor/13-implementation-report.md | Manager UI/UX implementation report | Tier 2: SDD | Aktuell | Status of implementation work |
| docs/sdd/manager-ui-ux-refactor/14-final-review.md | Manager UI/UX final review | Tier 2: SDD | Aktuell | Final QA and review |
| docs/sdd/manager-ui-ux-refactor/15-component-inventory.md | Manager component inventory | Tier 2: SDD | Aktuell | Complete list of manager components |
| docs/sdd/manager-ui-ux-refactor/16-modularization-plan.md | Manager modularization plan | Tier 2: SDD | Aktuell | Component refactoring strategy |
| docs/sdd/manager-ui-ux-refactor/17-element-design-matrix.md | Manager element design matrix | Tier 2: SDD | Aktuell | Design specifications for each element |
| docs/sdd/manager-ui-ux-refactor/18-component-api-guidelines.md | Manager component API guidelines | Tier 2: SDD | Aktuell | API contract for manager components |
| docs/sdd/manager-ui-ux-refactor/19-modularization-report.md | Manager modularization report | Tier 2: SDD | Aktuell | Status of refactoring work |
| docs/sdd/manager-ui-ux-refactor/20-visual-consistency-spec.md | Manager visual consistency specification | Tier 2: SDD | Aktuell | Design system alignment spec |
| docs/sdd/manager-ui-ux-refactor/21-visual-element-audit.md | Manager visual element audit | Tier 2: SDD | Aktuell | Component and visual audit |
| docs/sdd/manager-ui-ux-refactor/22-visual-consistency-report.md | Manager visual consistency report | Tier 2: SDD | Aktuell | Implementation status |
| docs/architecture/README.md | Architecture documentation index | Tier 2: Deployment | Aktuell | Navigation hub for architecture docs |
| docs/containers/baseline.md | Container and deployment baseline | Tier 2: Deployment | Aktuell | Docker, Kubernetes, and container specifications |
| docs/gaps/kahoot-feature-matrix-2026.md | Kahoot feature gap matrix | Tier 2: Research | Aktuell | Comparison of Razzoozle vs. Kahoot features |
| docs/gaps/kahoot-gap-analysis-2026-07-23.md | Kahoot gap analysis (2026-07-23) | Tier 2: Research | Aktuell | Detailed gap analysis and remediation roadmap |
| docs/security/rust-razzoozle-security-audit-2026-07-13.md | Rust/Razzoozle security audit (2026-07-13) | Tier 2: Research | Aktuell | Security assessment findings and recommendations |
| docs/planning/NEXT-SESSION-kickoff-2026-07-15.md | Kickoff prompt for session (2026-07-15) | Tier 2: Planning | Historisch | Session planning (historical kickoff) |
| docs/planning/NEXT-SESSION-open-ends.md | Open ends from previous session | Tier 2: Planning | Historisch | Session-specific notes (historical) |
| docs/planning/NEXT-SESSION-start-2026-07-14.md | Session start prompt (2026-07-14) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/NEXT-SESSION-start-2026-07-16.md | Session start prompt (2026-07-16) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/NEXT-SESSION-start-manager-uiux.md | Manager UI/UX session kickoff | Tier 2: Planning | Historisch | Session planning for manager refactor (historical) |
| docs/planning/NEXT-SESSION-start-prompt.md | Session start prompt (generic) | Tier 2: Planning | Historisch | Template session kickoff (historical) |
| docs/planning/audit-followup-sdd-2026-07-15.md | Audit followup specifications (2026-07-15) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/backlog-2026-07-16.md | Backlog snapshot (2026-07-16) | Tier 2: Planning | Historisch | Session backlog (historical) |
| docs/planning/filter-group-labels-opinion.md | Filter and group labels design opinion | Tier 2: Planning | Historisch | Design discussion (historical) |
| docs/planning/game-ui-consistency-implementation-matrix.md | Game UI consistency implementation matrix | Tier 2: Planning | Historisch | Implementation tracking (historical) |
| docs/planning/i18n-guard-sdd-2026-07-15.md | Internationalization guard specification (2026-07-15) | Tier 2: Planning | Historisch | Feature spec (historical) |
| docs/planning/klassenmanager-fixes-sdd-2026-07-14.md | Classroom manager fixes (2026-07-14) | Tier 2: Planning | Historisch | Bug fix planning (historical) |
| docs/planning/labels-sdd-2026-07-14.md | Labels feature specification (2026-07-14) | Tier 2: Planning | Historisch | Feature spec (historical) |
| docs/planning/list-consolidation-opinion.md | List consolidation design opinion | Tier 2: Planning | Historisch | Design discussion (historical) |
| docs/planning/manager-component-migration-matrix.md | Manager component migration matrix | Tier 2: Planning | Historisch | Refactoring tracking (historical) |
| docs/planning/manager-followup-implementation-matrix.md | Manager followup implementation matrix | Tier 2: Planning | Historisch | Implementation tracking (historical) |
| docs/planning/manager-followup-sdd-2026-07-22.md | Manager followup specification (2026-07-22) | Tier 2: Planning | Historisch | Feature spec (recent historical) |
| docs/planning/manager-ui-consistency-audit.md | Manager UI consistency audit | Tier 2: Planning | Historisch | Audit findings (historical) |
| docs/planning/manager-ui-consistency-result.md | Manager UI consistency results | Tier 2: Planning | Historisch | Audit results (historical) |
| docs/planning/manager-uiux-KICKOFF-next-session.md | Manager UI/UX kickoff for next session | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/p6-skeleton-structural-tail-sdd.md | P6 skeleton structural tail specification | Tier 2: Planning | Historisch | Feature spec (historical) |
| docs/planning/p6-users-structural-tail-sdd.md | P6 users structural tail specification | Tier 2: Planning | Historisch | Feature spec (historical) |
| docs/planning/razzoozle-backlog-completion-wps.md | Razzoozle backlog completion work packages | Tier 2: Planning | Historisch | Backlog planning (historical) |
| docs/planning/schuelerverwaltung-ausbau-sdd-2026-07-14.md | Student management expansion (2026-07-14) | Tier 2: Planning | Historisch | Feature spec (historical) |
| docs/planning/security-wave-sdd-2026-07-15.md | Security wave specification (2026-07-15) | Tier 2: Planning | Historisch | Security feature planning (historical) |
| docs/planning/setting-row-spec.md | Settings row component specification | Tier 2: Planning | Historisch | Component spec (historical) |
| docs/planning/wave2-addendum-waveD-2026-07-14.md | Wave 2 addendum for wave D (2026-07-14) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/wave2-feature-bug-sdd-2026-07-14.md | Wave 2 feature and bug specifications (2026-07-14) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/wave2-start-prompt.md | Wave 2 session start prompt | Tier 2: Planning | Historisch | Session kickoff (historical) |
| docs/planning/wave2b-addendum-sdd-2026-07-14.md | Wave 2B addendum (2026-07-14) | Tier 2: Planning | Historisch | Session planning (historical) |
| docs/planning/welle2-modularisierung-sdd-2026-07-15.md | Modularization wave 2 (2026-07-15) | Tier 2: Planning | Historisch | Refactoring planning (historical) |
| docs/planning/wp0-primitive-cells.md | Primitive cells work package | Tier 2: Planning | Historisch | Component planning (historical) |
| docs/agents/i18n-guard.md | Internationalization guard automation | Tier 2: Utilities | Aktuell | Agent script for i18n consistency checks |
| docs/agents/locale-sync.md | Locale synchronization automation | Tier 2: Utilities | Aktuell | Agent script for locale file management |
| docs/specs/manager-row-system.md | Manager row system technical specification | Tier 2: Utilities | Aktuell | Detailed technical spec for row-based UI system |
| db/README.md | Database setup and schema documentation | Tier 3 | Aktuell | Postgres database schema and setup guide |
| rust/README.md | Rust server: build, test, performance, crates | Tier 3 | Aktuell | Rust workspace documentation and build instructions |
| .claude/state/GROK_START_PROMPT.md | Grok agent start prompt | Tier 4: Operational | Historisch | Session-specific prompt (historical) |
| .claude/state/HANDOFF_grok.md | Handoff notes for Grok agent | Tier 4: Operational | Historisch | Session handoff (historical) |
| e2e/golden-frames/README.md | Golden frames test documentation | Other | Aktuell | E2E test baseline documentation |
| e2e/stagehand/README.md | Stagehand E2E testing framework | Other | Aktuell | Stagehand-based test framework documentation |
| examples/plugins/starter/ADDON-SKELETON.md | Example plugin skeleton | Other | Aktuell | Plugin development template |
| .github/ISSUE_TEMPLATE/bug_report.md | GitHub bug report template | Other | Aktuell | Issue template for bug reports |
| .github/ISSUE_TEMPLATE/feature_request.md | GitHub feature request template | Other | Aktuell | Issue template for feature requests |
| packages/web/THIRD_PARTY_LICENSES.md | Third-party licenses | Other | Aktuell | License attribution for dependencies |

---

## Summary by Status

| Status | Count | Description |
|--------|-------|-------------|
| Aktuell (Current) | 135 | Actively used and accurate for present development |
| Historisch (Historical) | 34 | Describe past sessions or features; retained as records |
| Veraltet (Stale) | 0 | No documents identified as making false claims |

---

## Summary by Tier

| Tier | Count |
|------|-------|
| Tier 1: Entry Points | 4 |
| Tier 1: Meta & Info | 4 |
| Tier 1: Changelog | 1 |
| Tier 1: Localized | 5 |
| Tier 2: ADR | 11 |
| Tier 2: Reference | 9 |
| Tier 2: Design | 37 |
| Tier 2: SDD | 48 |
| Tier 2: Deployment | 2 |
| Tier 2: Research | 3 |
| Tier 2: Planning | 32 |
| Tier 2: Utilities | 3 |
| Tier 3 | 2 |
| Tier 4: Operational | 2 |
| Other | 5 |
| **Total** | **169** |

---

## Stale or Problematic Documents

Currently, **no documents are classified as stale** (i.e., making false claims about the present state).

However, the following documents are noted as **historical** because they describe past sessions or superseded configurations:

- `docs/design/NGINX_RUST_ONLY_REFERENCE.md` — References old Rust-only deployment model; superseded by Node/Rust hybrid
- `docs/sdd/fill-blank-matching-contract-freeze.md` — Older feature contract; represented in current design docs
- 32 files in `docs/planning/` — Session-specific kickoffs and planning documents (May–July 2026)
- 2 files in `.claude/state/` — Session-specific prompts and handoff notes

All historical documents remain in the repository as records of past work and design decisions. No cleanup is recommended at this time.

---

## Recommendations for Future Work

1. **Deduplication (ADR-004 §Immediate):** Audit `CLAUDE.md` for command duplication; all commands should reference `AGENTS.md` §Key Commands as the single source of truth.

2. **Planning Docs:** Consider archiving or moving `docs/planning/` documents older than 2 months to a `docs/planning/archive/` directory to keep the planning folder focused on current work.

3. **Session State Cleanup:** Periodically archive `.claude/state/` files after sessions complete to `.claude/archive/state/`.

4. **Documentation Index:** Ensure `docs/README.md` is regularly updated to reflect the current state of `docs/` subdirectories.

---

**Inventory Created:** 2026-07-29  
**Methodology:** Systematic file discovery + manual tier/purpose/status classification per ADR-004
