import { z } from "zod"

// Installed plugin metadata (mirrors the file-level manifest).
export const installedPluginValidator = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  version: z.string().min(1).max(20),
  description: z.string().max(500),
  author: z.string().max(100),
  repository: z.string().max(500).optional(),
  license: z.string().max(50).optional(),
  lifecycleEnabled: z.boolean().default(false),
})

export type InstalledPlugin = z.infer<typeof installedPluginValidator>
