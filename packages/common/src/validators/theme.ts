import { z } from "zod"

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")

// A served asset reference: null (use bundled default) or a path under /theme/
// or /media/ (incl. nested subdirs like /media/backgrounds/x.webp after the media
// restructure). Each "/"-separated segment is [\w.-] so a traversal "../" can't
// form (a ".." segment is allowed as a literal name but never as a path op — the
// real filesystem guard is assertSafeId on the server, this is only a URL ref).
const assetRef = z
  .string()
  .regex(
    /^\/(?:theme|media)\/(?:[\w.-]+\/)*[\w.-]+$/,
    "errors:theme.invalidAsset",
  )
  .nullable()

// Per-slot animated background config. Defaults reproduce the current look
// (CreamBackdrop, full speed/intensity, all 12 floating icons) so this is a
// visual no-op until the manager UI changes it.
const animatedBg = z
  .object({
    type: z.enum(["none", "creamBackdrop"]).default("creamBackdrop"),
    speed: z.number().min(0.25).max(3).default(1), // animation speed multiplier (1 = current)
    intensity: z.number().min(0).max(1).default(1), // blob/visual opacity multiplier (1 = current)
    iconCount: z.number().int().min(0).max(12).default(12), // floating icons (12 = current)
    color: z.union([hexColor, z.literal("")]).default(""), // hex tint for the backdrop ("" = theme-derived)
  })
  .default({ type: "creamBackdrop", speed: 1, intensity: 1, iconCount: 12, color: "" })

export const themeValidator = z.object({
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorText: hexColor.default("#ffffff"),
  answerColors: z.tuple([hexColor, hexColor, hexColor, hexColor]),
  answerTextColor: hexColor.default("#0B0B12"),
  accentColor: hexColor.default("#ff9900"),
  radius: z.number().min(0).max(40).default(16),
  scrim: z.number().min(0).max(100).default(0),
  appTitle: z.string().max(40).nullable().default(null),
  logo: assetRef.default(null),
  showBranding: z.boolean().default(true),
  backgrounds: z.object({
    auth: assetRef,
    managerGame: assetRef,
    playerGame: assetRef,
    animated: z
      .object({
        auth: animatedBg,
        managerGame: animatedBg,
        playerGame: animatedBg,
      })
      .default({
        auth: {
          type: "creamBackdrop",
          speed: 1,
          intensity: 1,
          iconCount: 12,
          color: "",
        },
        managerGame: {
          type: "creamBackdrop",
          speed: 1,
          intensity: 1,
          iconCount: 12,
          color: "",
        },
        playerGame: {
          type: "creamBackdrop",
          speed: 1,
          intensity: 1,
          iconCount: 12,
          color: "",
        },
      }),
    animatedCss: z.string().max(20000).default(""),
  }),
  // Skeleton-system token additions — every field is optional with a Zod
  // `.default(...)` so old theme.json files (and DEFAULT_THEME) stay valid and
  // nested objects get an object-level default for shallow-partial inputs.
  teamColors: z
    .object({
      red: hexColor.default("#ef4444"),
      blue: hexColor.default("#3b82f6"),
      green: hexColor.default("#22c55e"),
      yellow: hexColor.default("#facc15"),
    })
    .default({
      red: "#ef4444",
      blue: "#3b82f6",
      green: "#22c55e",
      yellow: "#facc15",
    }),
  tierColors: z
    .object({
      bronze: hexColor.default("#b45309"),
      silver: hexColor.default("#9ca3af"),
      gold: hexColor.default("#eab308"),
      diamant: hexColor.default("#38bdf8"),
    })
    .default({
      bronze: "#b45309",
      silver: "#9ca3af",
      gold: "#eab308",
      diamant: "#38bdf8",
    }),
  stateColors: z
    .object({
      correct: hexColor.default("#22c55e"),
      wrong: hexColor.default("#ef4444"),
    })
    .default({ correct: "#22c55e", wrong: "#ef4444" }),
  rankColors: z
    .object({
      up: hexColor.default("#10b981"),
      down: hexColor.default("#f43f5e"),
    })
    .default({ up: "#10b981", down: "#f43f5e" }),
  timerUrgent: hexColor.default("#ff3b30"),
  streakColor: hexColor.default("#b45309"),
  surfaceMuted: hexColor.default("#374151"),
  footerColors: z
    .object({
      bg: hexColor.default("#ffffff"),
      text: hexColor.default("#1f2937"),
    })
    .default({ bg: "#ffffff", text: "#1f2937" }),
  // Manager-tunable motion tokens — defaults mirror presets.ts SPRING (300/24)
  // and scale 1.0 so an absent/old theme.json stays a visual no-op.
  animation: z
    .object({
      springStiffness: z.number().min(50).max(1000).default(300),
      springDamping: z.number().min(5).max(60).default(24),
      durationScale: z.number().min(0.25).max(3).default(1),
      staggerScale: z.number().min(0).max(3).default(1),
    })
    .default({
      springStiffness: 300,
      springDamping: 24,
      durationScale: 1,
      staggerScale: 1,
    }),
  // Sound-pack overrides — one assetRef per SOUND_SLOT. null ⇒ playback falls
  // back to the bundled default mp3 (SOUND_DEFAULTS), so an absent/old theme.json
  // stays an audio no-op. Object-level `.default` keeps shallow-partial inputs
  // (and DEFAULT_THEME) valid; default = all null.
  sounds: z
    .object({
      answersMusic: assetRef,
      answersSound: assetRef,
      podiumThree: assetRef,
      podiumSecond: assetRef,
      podiumFirst: assetRef,
      podiumSnearRoll: assetRef,
      results: assetRef,
      show: assetRef,
      boump: assetRef,
      tierBronze: assetRef,
      tierSilver: assetRef,
      tierGold: assetRef,
      tierDiamant: assetRef,
    })
    .default({
      answersMusic: null,
      answersSound: null,
      podiumThree: null,
      podiumSecond: null,
      podiumFirst: null,
      podiumSnearRoll: null,
      results: null,
      show: null,
      boump: null,
      tierBronze: null,
      tierSilver: null,
      tierGold: null,
      tierDiamant: null,
    }),
  // Skeleton overrides — content lives in files (config/theme/skeleton.css|js),
  // theme.json only carries the enable flags + a cache-bust version.
  customCssEnabled: z.boolean().default(false),
  customJsEnabled: z.boolean().default(false),
  skeletonVersion: z.number().int().min(0).default(0),
})

// A savable, named theme preset. `id` is server-assigned (slug of name) on save,
// so it's optional on the wire. Mirrors the ThemeTemplate type.
export const themeTemplateValidator = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  theme: themeValidator,
})

// WP-18 — on-disk theme revision validator (reuses themeValidator). Lenient
// id/createdAt (free strings) so a persisted revision never fails read-validation.
export const themeRevisionValidator = z.object({
  id: z.string(),
  createdAt: z.string(),
  theme: themeValidator,
})
