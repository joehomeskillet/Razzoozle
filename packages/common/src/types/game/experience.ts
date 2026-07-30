// Content-free `game:experience` transition envelope (WP #877, protocol
// contract WP #876). Mirrors the wire-relevant subset of
// rust/protocol/src/experience.rs::ExperienceTransition — only the fields the
// display components render today. Mode-specific payload fields (team_steps,
// chase) land here once WP #904/#905 need them client-side.
export interface ExperienceTransition {
  mode: string
  phase: string
  answered?: number
  total?: number
}
