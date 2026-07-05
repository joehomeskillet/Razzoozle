//! razzoozle-protocol — wire-protocol types for the Razzoozle socket protocol.
//!
//! Phase 1 of the TS->Rust port. Ground truth:
//! - packages/common/src/constants.ts (event strings)
//! - packages/common/src/types/game/{socket,status}.ts (payload shapes)
//! - docs/rust-port-event-inventory.md (event inventory)

pub mod constants;
pub mod game;
pub mod status;
pub mod player;
pub mod manager;
pub mod theme;
pub mod quizz;
pub mod media_ai;
pub mod results_display;
