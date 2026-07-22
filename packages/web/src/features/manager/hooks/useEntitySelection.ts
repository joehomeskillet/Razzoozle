import { useEffect, useState } from "react"

/**
 * Generic multi-select state for manager list/grid views, generalized from
 * ConfigMedia's useMediaSelection but decoupled from media/socket concerns.
 *
 * - Selection is a Set of caller-supplied ids (string or number).
 * - `allIds` is the currently visible/selectable id list: `toggleAll` selects
 *   exactly these ids, and a pruning effect drops ids that disappear (e.g.
 *   after a delete or list refresh) so the set can't accumulate stale entries.
 * - Anchor/Shift-click range selection is intentionally NOT here — that stays
 *   a per-feature concern (see ConfigMedia's useMediaSelection).
 */
export function useEntitySelection<Id extends string | number>(allIds: Id[]) {
  const [selected, setSelected] = useState<Set<Id>>(new Set())

  // Drop selected ids that no longer exist in `allIds` (e.g. after a delete
  // or list refresh) so the selection set can't accumulate stale entries.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const live = new Set(allIds)
      const next = new Set([...prev].filter((id) => live.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [allIds])

  const isSelected = (id: Id) => selected.has(id)

  const toggle = (id: Id) => {
    setSelected((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  // Every id in `allIds` selected → clear; otherwise select exactly `allIds`.
  const toggleAll = () => {
    setSelected((prev) =>
      allIds.length > 0 && allIds.every((id) => prev.has(id))
        ? new Set<Id>()
        : new Set(allIds),
    )
  }

  const clear = () => setSelected(new Set())

  const selectionActive = selected.size > 0
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected

  return {
    allSelected,
    clear,
    isSelected,
    selected,
    selectionActive,
    someSelected,
    toggle,
    toggleAll,
  }
}
