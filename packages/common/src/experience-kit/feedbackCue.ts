// Experience feedback cues — 11 defined interactions mapped to audio + haptic primitives.
// These are high-level semantic signals; the service translates each to appropriate
// sound slots and haptic patterns, gated by user preferences (mute, haptics toggle).
export type ExperienceFeedbackCue =
  | "progress-small"      // incremental progress (answer correct, tier earned, streak gained)
  | "progress-large"      // major progress (round won, milestone reached)
  | "negative-small"      // minor setback (wrong answer, streak broken)
  | "negative-large"      // major setback (game lost, time expired)
  | "powerup-ready"       // power-up available (charge complete, ready to activate)
  | "powerup-activate"    // power-up triggered (activated, in flight)
  | "shield-block"        // shield hit / damage mitigation
  | "phase-complete"      // game phase transition (intro→play, play→results)
  | "achievement"         // achievement/badge awarded
  | "game-win"            // game victory (first-correct / podium)
  | "game-loss"           // game defeat
