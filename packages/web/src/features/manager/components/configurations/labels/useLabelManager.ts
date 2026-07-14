import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export interface Label {
  id: number
  name: string
  color: string
}

export const useLabelManager = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [labels, setLabels] = useState<Label[]>([])
  const [search, setSearch] = useState("")

  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<Label | null>(
    null,
  )

  const filteredLabels = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) {
      return labels
    }
    return labels.filter((label) =>
      label.name.toLowerCase().includes(query),
    )
  }, [labels, search])

  const sortedLabels = useMemo(
    () => [...filteredLabels].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredLabels],
  )

  // ---- Incoming events ----

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEvent(EVENTS.LABEL.DATA as any, (data: { labels: Label[] }) => {
    setLabels(data.labels)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEvent(EVENTS.LABEL.ERROR as any, (message: string) => {
    toast.error(t(message))
  })

  // Initial load — gated on isConnected (namespace-connected + authed)
  useEffect(() => {
    if (!isConnected) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit(EVENTS.LABEL.LIST as any)
  }, [isConnected, socket])

  // ---- Handlers (return boolean success for dialog close-on-success) ----

  const handleCreateLabel = useCallback(
    (name: string, color?: string): boolean => {
      if (!name.trim()) {
        toast.error(t("manager:labels.namePlaceholder"))
        return false
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.emit(EVENTS.LABEL.CREATE as any, {
        name: name.trim(),
        ...(color ? { color } : {}),
      })
      setSearch("")
      return true
    },
    [socket, t],
  )

  const handleUpdateLabel = useCallback(
    (id: number, name?: string, color?: string): boolean => {
      if (!name?.trim()) {
        toast.error(t("manager:labels.namePlaceholder"))
        return false
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.emit(EVENTS.LABEL.UPDATE as any, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(color ? { color } : {}),
      })
      return true
    },
    [socket, t],
  )

  const handleDeleteLabel = useCallback((): void => {
    if (pendingDeleteLabel) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.emit(EVENTS.LABEL.DELETE as any, { id: pendingDeleteLabel.id })
      setPendingDeleteLabel(null)
    }
  }, [socket, pendingDeleteLabel])

  return {
    labels: sortedLabels,
    hasLabels: labels.length > 0,
    search,
    setSearch,
    pendingDeleteLabel,
    setPendingDeleteLabel,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  }
}
