import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { CatalogEntry, CatalogModalMode } from "./types"

export type CatalogScope = "own" | "global" | "all"

// State + socket wiring for the catalog list (search/scope/label-filter,
// single + bulk delete, inline label assign). Extracted from ConfigCatalog so
// the render tree stays under the monolith-guard budget — mirrors
// useQuizzManager's split between state (hook) and JSX (component).
export const useCatalogManager = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const klassenEnabled = useManagerStore(
    (s) => s.config?.klassenEnabled ?? false,
  )

  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<CatalogScope>("all")
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null)
  const [modalMode, setModalMode] = useState<CatalogModalMode>("add")
  const [editingEntry, setEditingEntry] = useState<CatalogEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingOp, setPendingOp] = useState<CatalogModalMode | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    question: string
  } | null>(null)
  // Multi-select state keyed by entry id (mirrors useQuizzManager:42).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const requestCatalog = useCallback(() => {
    socket.emit(EVENTS.CATALOG.LIST, { scope })
  }, [socket, scope])

  useEffect(() => {
    requestCatalog()
  }, [requestCatalog])

  useEvent(
    EVENTS.CATALOG.DATA,
    useCallback((nextEntries: CatalogEntry[]) => {
      setEntries(nextEntries)
    }, []),
  )

  useEvent(
    EVENTS.CATALOG.ERROR,
    useCallback(
      (message: string) => {
        setPendingOp(null)
        toast.error(t(message))
      },
      [t],
    ),
  )

  useEvent(
    EVENTS.CATALOG.ADD_SUCCESS,
    useCallback(() => {
      setModalOpen(false)
      setEditingEntry(null)
      toast.success(
        t(
          pendingOp === "edit"
            ? "manager:catalog.updated"
            : "manager:catalog.saved",
        ),
      )
      setPendingOp(null)
      requestCatalog()
    }, [pendingOp, requestCatalog, t]),
  )

  useEvent(
    EVENTS.LABEL.ASSIGNED,
    useCallback(
      (payload) => {
        if (payload.entityType === "catalog") {
          requestCatalog()
        }
      },
      [requestCatalog],
    ),
  )

  // Drop ids that are no longer in the list — mirrors useQuizzManager's prune
  // effect (:108-121) so a stale selection can't bulk-delete entries that
  // already vanished (e.g. deleted by another tab).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const existing = new Set(entries.map((entry) => entry.id))
      const next = new Set([...prev].filter((id) => existing.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [entries])

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    let results = entries

    if (q) {
      results = results.filter((entry) => {
        const question = entry.question.question.toLowerCase()
        const tags = entry.tags ?? []
        return (
          question.includes(q) ||
          tags.some((tag) => tag.toLowerCase().includes(q))
        )
      })
    }

    if (selectedLabelId !== null && klassenEnabled) {
      results = results.filter((entry) => {
        const entryLabelIds = entry.labelIds ?? []
        return entryLabelIds.includes(selectedLabelId)
      })
    }

    return results
  }, [entries, search, selectedLabelId, klassenEnabled])

  const openAddModal = () => {
    setModalMode("add")
    setEditingEntry(null)
    setModalOpen(true)
  }

  const openEditModal = (entry: CatalogEntry) => {
    setModalMode("edit")
    setEditingEntry(entry)
    setModalOpen(true)
  }

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingEntry(null)
    setPendingOp(null)
  }, [])

  const handleDelete = () => {
    if (!pendingDelete) {
      return
    }

    socket.emit(EVENTS.CATALOG.DELETE, { id: pendingDelete.id })
    toast.success(t("manager:catalog.deleted"))
    setPendingDelete(null)
    requestCatalog()
  }

  const clearSelection = () => setSelected(new Set())

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
  }

  // Client-side loop over CATALOG.DELETE — no bulk server event, mirrors
  // useQuizzManager.handleBulkDelete (:137-145).
  const handleBulkDelete = () => {
    selected.forEach((id) => {
      socket.emit(EVENTS.CATALOG.DELETE, { id })
    })
    toast.success(t("manager:catalog.deleted"))
    clearSelection()
    setBulkDeleteOpen(false)
    requestCatalog()
  }

  const handleLabelAssign = (entryId: string, labelIds: number[]) => {
    socket.emit(EVENTS.LABEL.ASSIGN, {
      entityType: "catalog",
      entityId: entryId,
      labelIds,
    })
  }

  const selectionCount = selected.size
  const selectionActive = selectionCount > 0

  return {
    entries,
    filteredEntries,
    search,
    setSearch,
    scope,
    setScope,
    selectedLabelId,
    setSelectedLabelId,
    klassenEnabled,
    modalMode,
    editingEntry,
    modalOpen,
    pendingOp,
    setPendingOp,
    pendingDelete,
    setPendingDelete,
    selected,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    selectionCount,
    selectionActive,
    openAddModal,
    openEditModal,
    closeModal,
    handleDelete,
    clearSelection,
    toggleSelect,
    handleBulkDelete,
    handleLabelAssign,
  }
}
