import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
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

  const visibleEntryIds = useMemo(() => filteredEntries.map((e) => e.id), [filteredEntries])
  const selection = useEntitySelection(visibleEntryIds)

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

  // Client-side loop over CATALOG.DELETE — no bulk server event, mirrors
  // useQuizzManager.handleBulkDelete (:137-145).
  const handleBulkDelete = () => {
    selection.selected.forEach((id) => {
      socket.emit(EVENTS.CATALOG.DELETE, { id })
    })
    toast.success(t("manager:catalog.deleted"))
    selection.clear()
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

  const selectionCount = selection.selected.size
  const selectionActive = selection.selectionActive

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
    selected: selection.selected,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    selectionCount,
    selectionActive,
    openAddModal,
    openEditModal,
    closeModal,
    handleDelete,
    selection,
    handleBulkDelete,
    handleLabelAssign,
  }
}
