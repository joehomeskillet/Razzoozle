import { z } from "zod"

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")

// A background reference: either null (use bundled default) or a path under
// the served /theme/ directory (e.g. "/theme/managerGame-1700000000.png").
const backgroundRef = z
  .string()
  .regex(/^\/theme\/[\w.-]+$/, "errors:theme.invalidBackground")
  .nullable()

export const themeValidator = z.object({
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  answerColors: z.tuple([hexColor, hexColor, hexColor, hexColor]),
  backgrounds: z.object({
    auth: backgroundRef,
    managerGame: backgroundRef,
    playerGame: backgroundRef,
  }),
})

export type ThemeValidated = z.infer<typeof themeValidator>
