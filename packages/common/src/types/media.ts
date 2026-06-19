import type { MediaCategory } from "@razzoozle/common/constants"

// A single media-library item tracked in config/media-manifest.json and shown
// in the manager Media tab. `url` is same-origin relative (/media/<cat>/<file>).
export interface MediaMeta {
  id: string
  filename: string
  url: string
  size: number
  type: "image" | "audio" | "video"
  category: MediaCategory
  source: "upload" | "ai" | "theme"
  uploadedAt: string
  width?: number // WP-6 — image-only; absent on audio + on pre-existing manifest rows
  height?: number // WP-6 — image-only; absent on audio + on pre-existing manifest rows
}
