import { EVENTS } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { type MouseEvent, useEffect, useState } from "react"

export const useMediaSelection = ({
  filtered,
  items,
  requestMedia,
}: {
  filtered: MediaMeta[]
  items: MediaMeta[]
  requestMedia: () => void
}) => {
  const { socket } = useSocket()

  // Multi-select state keyed by media id. `anchor` is the pivot for Shift+click
  // range selection (set on the last plain/ctrl click). Pattern mirrors
  // QuizzEditorSidebar, but indexed by stable ids since `filtered` reorders.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Drop any ids that no longer exist (e.g. after a delete / list refresh) so
  // the selection set can't accumulate stale entries.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const live = new Set(items.map((item) => item.id))
      const next = new Set([...prev].filter((id) => live.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [items])

  const clearSelection = () => {
    setSelected(new Set())
    setAnchor(null)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
    setAnchor(id)
  }

  const handleBulkDelete = () => {
    selected.forEach((id) => {
      socket.emit(EVENTS.MEDIA.DELETE, { id })
    })
    // No per-id ack, so refresh the list once after firing the batch; MEDIA.DATA
    // resyncs the grid and MEDIA.ERROR (listened above) surfaces any failures.
    requestMedia()
    clearSelection()
    setBulkDeleteOpen(false)
  }

  // Card click → toggle membership. Plain click toggles a single card; Shift
  // selects the contiguous range from the anchor; Ctrl/Cmd toggles too. Range
  // operates over the currently filtered order so it matches what the user sees.
  const handleCardSelect =
    (id: string) => (event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && anchor) {
        const order = filtered.map((item) => item.id)
        const from = order.indexOf(anchor)
        const to = order.indexOf(id)

        if (from !== -1 && to !== -1) {
          const lo = Math.min(from, to)
          const hi = Math.max(from, to)
          // Union the range with the existing selection so shift-click extends
          // rather than replaces what the user already picked.
          setSelected((prev) => {
            const next = new Set(prev)
            for (const rangeId of order.slice(lo, hi + 1)) {
              next.add(rangeId)
            }

            return next
          })

          return
        }
      }

      toggleSelect(id)
    }

  const selectionActive = selected.size > 0

  return {
    bulkDeleteOpen,
    clearSelection,
    handleBulkDelete,
    handleCardSelect,
    selected,
    selectionActive,
    setBulkDeleteOpen,
  }
}
