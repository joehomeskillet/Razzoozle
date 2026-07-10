/**
 * Razzoozle global shape for skeleton/theme integration.
 *
 * The plugin system has been removed from the manager UI. This file is retained
 * only for the RazzoozleGlobal type, which is used by features/theme/apply.ts
 * to type window.razzoozle for theme and skeleton version assignment.
 *
 * Game-side plugin render slots remain inert and are subject to future cleanup.
 */

// Public host global. Used by apply.ts to type window.razzoozle for theme assignment.
// The theme layer (apply.ts) sets `{ theme, skeletonVersion }` on this shape.
export interface RazzoozleGlobal {
  // Skeleton/theme fields (owned by apply.ts).
  theme?: unknown
  skeletonVersion?: number
}
