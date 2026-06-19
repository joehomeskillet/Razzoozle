/**
 * preview-channel.ts — FROZEN cross-window contract for the live theme preview.
 *
 * The manager Design editor opens a standalone `/theme-preview` window and pushes
 * the current draft Theme to it in real time over a same-origin BroadcastChannel.
 * The preview window applies each draft via `applyTheme` against its OWN document,
 * so the manager sees a real browser rendering that updates as they edit.
 *
 * Both sides import the channel name + message types from here so the editor and
 * the preview window can never drift. No DOM / React here — pure contract + helpers.
 */
import type { Theme } from "@razzoozle/common/types/theme"

/** BroadcastChannel name (same-origin). */
export const THEME_PREVIEW_CHANNEL = "theme-preview"

/** window.open target name + features for the preview popup. */
export const THEME_PREVIEW_WINDOW_NAME = "razzoozle-theme-preview"
export const THEME_PREVIEW_WINDOW_FEATURES = "width=440,height=860"
/** Route the preview window loads. */
export const THEME_PREVIEW_ROUTE = "/theme-preview"

/** editor → preview: the full draft Theme to render live. */
export interface ThemeDraftMessage {
  type: "theme"
  theme: Theme
}

/** preview → editor: the window mounted and is ready to receive the current draft. */
export interface ThemeReadyMessage {
  type: "ready"
}

export type ThemePreviewMessage = ThemeDraftMessage | ThemeReadyMessage

/** Open the shared channel. Returns null when BroadcastChannel is unavailable. */
export function openThemePreviewChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null
  return new BroadcastChannel(THEME_PREVIEW_CHANNEL)
}

/** editor: push the current draft Theme to the preview window. */
export function postThemeDraft(
  channel: BroadcastChannel | null,
  theme: Theme,
): void {
  channel?.postMessage({ type: "theme", theme } satisfies ThemeDraftMessage)
}

/** preview: signal the editor that the window is ready (so it re-sends the draft). */
export function postPreviewReady(channel: BroadcastChannel | null): void {
  channel?.postMessage({ type: "ready" } satisfies ThemeReadyMessage)
}

export function isThemeDraftMessage(
  data: unknown,
): data is ThemeDraftMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "theme" &&
    "theme" in data
  )
}

export function isThemeReadyMessage(data: unknown): data is ThemeReadyMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "ready"
  )
}
