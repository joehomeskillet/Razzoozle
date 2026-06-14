import AssetPreview, {
  type AssetPreviewProps,
} from "@razzia/web/features/manager/components/console/AssetPreview"

export interface AssetPreviewCardProps extends AssetPreviewProps {
  /**
   * Global theme scrim as a 0..100 percentage. When > 0 and an image is shown,
   * a dimming overlay is rendered on the thumbnail so the admin sees the same
   * darkening that the live surface applies. This mirrors the single global
   * `theme.scrim` — there is no per-card slider.
   */
  scrim?: number
}

/**
 * Thin wrapper around {@link AssetPreview} that forwards every prop unchanged
 * and adds the global-scrim overlay. The `aspect` is supplied verbatim by the
 * caller (e.g. `aspect-video` for 16:9 host/managerGame surfaces, a landscape
 * class for join/auth, a portrait class for player/playerGame). Presentational;
 * the tile and its controls are never forked.
 */
const AssetPreviewCard = ({ scrim, ...rest }: AssetPreviewCardProps) => {
  const overlay =
    scrim != null && scrim > 0 ? (
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: scrim / 100 }}
        aria-hidden
      />
    ) : undefined

  return <AssetPreview {...rest} overlay={overlay} />
}

export default AssetPreviewCard
