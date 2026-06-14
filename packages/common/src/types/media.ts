import type { MediaCategory } from "@razzia/common/constants"

// A single media-library item tracked in config/media-manifest.json and shown
// in the manager Media tab. `url` is same-origin relative (/media/<cat>/<file>).
export interface MediaMeta {
  id: string
  filename: string
  url: string
  size: number
  type: "image" | "audio"
  category: MediaCategory
  source: "upload" | "ai" | "theme"
  uploadedAt: string
}
