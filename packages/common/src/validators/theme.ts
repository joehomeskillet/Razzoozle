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

export const themeValidator = z.object({
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorText: hexColor.default("#ffffff"),
  answerColors: z.tuple([hexColor, hexColor, hexColor, hexColor]),
  answerTextColor: hexColor.default("#ffffff"),
  accentColor: hexColor.default("#ff9900"),
  radius: z.number().min(0).max(40).default(16),
  scrim: z.number().min(0).max(100).default(40),
  appTitle: z.string().max(40).nullable().default(null),
  logo: assetRef.default(null),
  showBranding: z.boolean().default(true),
  backgrounds: z.object({
    auth: assetRef,
    managerGame: assetRef,
    playerGame: assetRef,
  }),
})

// A savable, named theme preset. `id` is server-assigned (slug of name) on save,
// so it's optional on the wire. Mirrors the ThemeTemplate type.
export const themeTemplateValidator = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  theme: themeValidator,
})
