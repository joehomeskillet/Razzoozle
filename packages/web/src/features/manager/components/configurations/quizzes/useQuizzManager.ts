import { EVENTS } from "@razzoozle/common/constants"
import type { QuizzWithId } from "@razzoozle/common/types/game"
import { quizzValidator } from "@razzoozle/common/validators/quizz"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { downloadQuizzJson } from "./downloadQuizzJson"
import type { SortKey } from "./types"

export const useQuizzManager = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Holds the ids of quizzes awaiting a QUIZZ.DATA response for export. The
  // QUIZZ.DATA event is shared (also used by the editor), so we only act on the
  // response whose id is in this pending set. A Set (not a single ref) keeps
  // concurrent exports from overwriting each other's pending id.
  const pendingExportIds = useRef<Set<string>>(new Set())
  const { t } = useTranslation()
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name-asc")
  // The quiz pending a delete confirmation; drives the delete AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)
  // The quiz pending a duplicate confirmation; drives the duplicate AlertDialog.
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    id: string
    subject: string
  } | null>(null)
  // Multi-select state keyed by quiz id (indices would break under filter/sort).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Live search + sort applied to both the active and archived sections.
  const { activeQuizz, archivedQuizz, hasMatches } = useMemo(() => {
    const query = search.trim().toLowerCase()

    const matchesSearch = (subject: string) =>
      query.length === 0 || subject.toLowerCase().includes(query)

    const sortFn = (
      a: { subject: string; questionCount?: number },
      b: { subject: string; questionCount?: number },
    ) => {
      if (sortKey === "name-asc") {
        return a.subject.localeCompare(b.subject)
      }

      const countA = a.questionCount ?? 0
      const countB = b.questionCount ?? 0

      return sortKey === "count-asc" ? countA - countB : countB - countA
    }

    const active = quizz
      .filter((q) => !q.archived && matchesSearch(q.subject))
      .sort(sortFn)
    const archived = quizz
      .filter((q) => q.archived && matchesSearch(q.subject))
      .sort(sortFn)

    return {
      activeQuizz: active,
      archivedQuizz: archived,
      hasMatches: active.length > 0 || archived.length > 0,
    }
  }, [quizz, search, sortKey])

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    toast.error(t(message))
  })

  // Export: when the QUIZZ.DATA response for the quiz we requested arrives,
  // serialize it to JSON and download. Reuses the EXISTING auth-gated QUIZZ.GET
  // event (no new socket event).
  useEvent(EVENTS.QUIZZ.DATA, (data: QuizzWithId) => {
    if (!pendingExportIds.current.has(data.id)) {
      return
    }

    pendingExportIds.current.delete(data.id)
    downloadQuizzJson(data)
    toast.success(t("manager:quizz.exported"))
  })

  const handleExport = (id: string) => {
    pendingExportIds.current.add(id)
    socket.emit(EVENTS.QUIZZ.GET, id)
  }

  const clearSelection = () => setSelected(new Set())

  // Drop ids that are no longer SELECTABLE — only active (non-archived) rows
  // carry a checkbox, so prune against that set (not the full list). This means
  // archiving a selected quiz removes it from the selection, preventing a later
  // bulk-delete from silently deleting a now-hidden archived quiz.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const selectable = new Set(
        quizz.filter((q) => !q.archived).map((q) => q.id),
      )
      const next = new Set([...prev].filter((id) => selectable.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [quizz])

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

  const handleBulkDelete = () => {
    selected.forEach((id) => {
      socket.emit(EVENTS.QUIZZ.DELETE, id)
    })
    // ponytail: optimistic; failures surface via QUIZZ.ERROR
    toast.success(t("manager:quizz.deleted"))
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const selectionCount = selected.size
  const selectionActive = selectionCount > 0

  const handleDelete = () => {
    if (!pendingDelete) {
      return
    }

    socket.emit(EVENTS.QUIZZ.DELETE, pendingDelete.id)
    // ponytail: optimistic; failures surface via QUIZZ.ERROR
    toast.success(t("manager:quizz.deleted"))
    setPendingDelete(null)
  }

  const handleDuplicate = () => {
    if (!pendingDuplicate) {
      return
    }

    socket.emit(EVENTS.QUIZZ.DUPLICATE, pendingDuplicate.id)
    // ponytail: optimistic; failures surface via QUIZZ.ERROR
    toast.success(t("manager:quizz.duplicated"))
    setPendingDuplicate(null)
  }

  const handleArchived = (id: string, archived: boolean) => {
    socket.emit(EVENTS.QUIZZ.SET_ARCHIVED, { id, archived })
    // ponytail: optimistic; failures surface via QUIZZ.ERROR
    toast.success(
      t(
        archived
          ? "manager:quizz.archivedToast"
          : "manager:quizz.unarchivedToast",
      ),
    )
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      let data: unknown = null

      try {
        data = JSON.parse(event.target?.result as string)
      } catch {
        toast.error(t("manager:quizz.invalidJson"))

        return
      }

      const result = quizzValidator.safeParse(data)

      if (!result.success) {
        toast.error(t("manager:quizz.invalidJson"))

        return
      }

      socket.emit(EVENTS.QUIZZ.SAVE, result.data)
    }

    reader.onerror = () => {
      reader.abort()
      toast.error(
        t("manager:quizz.readError", {
          defaultValue: "Datei konnte nicht gelesen werden",
        }),
      )
    }

    reader.readAsText(file)
    e.target.value = ""
  }

  return {
    quizz,
    navigate,
    fileInputRef,
    showArchived,
    setShowArchived,
    search,
    setSearch,
    sortKey,
    setSortKey,
    pendingDelete,
    setPendingDelete,
    pendingDuplicate,
    setPendingDuplicate,
    selected,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    activeQuizz,
    archivedQuizz,
    hasMatches,
    handleExport,
    clearSelection,
    toggleSelect,
    handleBulkDelete,
    selectionCount,
    selectionActive,
    handleDelete,
    handleDuplicate,
    handleArchived,
    handleImport,
  }
}
