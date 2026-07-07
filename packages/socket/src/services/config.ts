// Thin barrel — services/config.ts used to be a ~3040-line monolith; every
// domain now lives under ./config/<domain>.ts (SRP split, verbatim move, zero
// consumer changes). This file's only job is to re-export the exact same
// public API so `@razzoozle/socket/services/config` keeps resolving to this
// file (extension resolution wins over the sibling ./config/ directory) while
// every symbol underneath is implemented in a focused module.
export * from "@razzoozle/socket/services/config/shared"
export * from "@razzoozle/socket/services/config/game-config"
export * from "@razzoozle/socket/services/config/achievements"
export * from "@razzoozle/socket/services/config/quizz"
export * from "@razzoozle/socket/services/config/results"
export * from "@razzoozle/socket/services/config/submissions"
export * from "@razzoozle/socket/services/config/catalog"
export * from "@razzoozle/socket/services/config/ai"
export * from "@razzoozle/socket/services/config/media"
export * from "@razzoozle/socket/services/config/theme"
export * from "@razzoozle/socket/services/config/theme-skeleton"
export * from "@razzoozle/socket/services/config/plugins"
export * from "@razzoozle/socket/services/config/solo-results"
export * from "@razzoozle/socket/services/config/assignments"
export * from "@razzoozle/socket/services/config/init"
