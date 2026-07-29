//! razzoozle-protocol — wire-protocol types for the Razzoozle socket protocol.
//!
//! Phase 1 of the TS->Rust port. Ground truth:
//! - packages/common/src/constants.ts (event strings)
//! - packages/common/src/types/game/{socket,status}.ts (payload shapes)
//! - docs/rust-port-event-inventory.md (event inventory)

pub mod constants;
pub mod game;
pub mod manager;
pub mod media_ai;
pub mod media_usage;
pub mod player;
pub mod quizz;
pub mod results_display;
pub mod status;
pub mod theme;
