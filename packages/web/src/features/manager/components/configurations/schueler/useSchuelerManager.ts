import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export interface StudentClassRef {
  id: number
  name: string
  // Present on the wire since WP-E1 (class:list carries `active`); optional
  // because older payloads may omit it. `active !== false` counts as active.
  active?: boolean
}

export interface SchuelerStudent {
  id: number
  displayName: string
  firstName?: string | null
  lastName?: string | null
  classes: StudentClassRef[]
  // ADDENDUM (birthdate): optional, only present once the parallel contract
  // WP lands the field on the wire. Structurally optional so this hook
  // compiles cleanly against today's contract and picks the value up for
  // free the moment the server starts sending it.
  birthdate?: string | null
  // ADDENDUM (active): student active/inactive status (WP-F1, migration
  // 022). Optional exactly like `birthdate` — the field lands on the wire
  // with the parallel backend WP; `active !== false` counts as active.
  active?: boolean
}

// ADDENDUM (WP-F2 contract freeze): student status/bulk socket events.
// The backend handlers land in the parallel WP-F1 follow-up; per the
// implementation matrix the event names are frozen client-side first so this
// view stays scoped to the schueler folder (packages/common constants are out
// of scope). Naming follows the existing `class:*` student convention
// (class:createStudent/class:removeStudent) and the WP-E bulk ack schema
// `{ succeeded: number[], failed: [{ id, reason }] }`.
export const SCHUELER_STUDENT_EVENTS = {
  /** req `{ studentId, active }` → ack `class:studentActiveSet` `{ studentId, active }` */
  SET_ACTIVE: "class:setStudentActive",
  ACTIVE_SET: "class:studentActiveSet",
  /** req `{ ids: number[], active }` → ack `{ succeeded, failed }` */
  BULK_SET_ACTIVE: "class:bulkSetStudentActive",
  BULK_ACTIVE_SET: "class:bulkStudentActiveSet",
  /** req `{ ids: number[] }` → ack `{ succeeded, failed }` */
  BULK_DELETE: "class:bulkDeleteStudents",
  BULK_DELETED: "class:bulkStudentsDeleted",
  /** req `{ ids: number[], classId }` → ack `{ succeeded, failed, classId }` (dedupes memberships) */
  BULK_ASSIGN_CLASS: "class:bulkAssignClass",
  BULK_CLASS_ASSIGNED: "class:bulkClassAssigned",
  /** req `{ ids: number[], classId }` → ack `{ succeeded, failed, classId }` */
  BULK_REMOVE_CLASS: "class:bulkRemoveClass",
  BULK_CLASS_REMOVED: "class:bulkClassRemoved",
} as const

export interface PinView {
  studentId: number
  pin: string
  labels: string[]
  // ADDENDUM (symbols): optional grapheme-safe array of the 4 emoji, index
  // -aligned with `labels`. Some emoji in the set are multi-codepoint (base
  // + U+FE0F variation selector), so `pin` alone can't be split reliably on
  // the client — only present once the parallel Rust WP lands it on the
  // wire. Structurally optional so this hook compiles cleanly either way.
  symbols?: string[]
}

// ADDENDUM (birthdate) — widened locally so we never need `as`/`any` casts;
// an object with all of a narrower contract type's required fields plus an
// extra OPTIONAL field is structurally assignable both ways, so this stays
// compatible whether or not the server already sends birthdate.
// ADDENDUM (N2): dual-payload pattern sends computed displayName alongside
// firstName/lastName so the wire works with both today's contract (uses displayName)
// and future v3 (server prefers firstName/lastName, falls back to displayName).
interface CreateStudentPayload {
  displayName: string
  firstName?: string
  lastName?: string
  classIds?: number[]
  birthdate?: string
}

export const useSchuelerManager = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [students, setStudents] = useState<SchuelerStudent[]>([])
  const [classes, setClasses] = useState<StudentClassRef[]>([])
  const [search, setSearch] = useState("")
  // SDD §3.2 status filter pills: null = all, otherwise active/inactive.
  // `active !== false` counts as active (field optional until WP-F1 lands).
  const [statusFilter, setStatusFilter] = useState<
    null | "active" | "inactive"
  >(null)

  // The currently-visible PIN dialog content. Populated by STUDENT_CREATED
  // (new student flow), STUDENT_PIN_DATA (clicking "PIN" on a row) and kept
  // in sync by PIN_REGENERATED. A single source of truth for the dialog.
  const [pinView, setPinView] = useState<PinView | null>(null)

  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<{
    id: number
    displayName: string
  } | null>(null)
  const [pendingRemoveFromClass, setPendingRemoveFromClass] = useState<{
    studentId: number
    displayName: string
    classId: number
    className: string
  } | null>(null)
  const [pendingRegenPin, setPendingRegenPin] = useState<{
    studentId: number
  } | null>(null)

  const filteredStudents = useMemo(() => {
    let list = students
    if (statusFilter === "active") {
      list = list.filter((s) => s.active !== false)
    } else if (statusFilter === "inactive") {
      list = list.filter((s) => s.active === false)
    }

    const query = search.trim().toLowerCase()
    if (query.length === 0) {
      return list
    }
    return list.filter(
      (s) =>
        s.displayName.toLowerCase().includes(query) ||
        s.classes.some((c) => c.name.toLowerCase().includes(query)),
    )
  }, [students, search, statusFilter])

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name)),
    [classes],
  )

  // ---- Incoming events ----

  useEvent(
    EVENTS.CLASS.ALL_STUDENTS_DATA,
    (data: { students: SchuelerStudent[] }) => {
      setStudents(data.students)
    },
  )

  useEvent(
    EVENTS.CLASS.DATA,
    (data: Array<{ id: number; name: string; active?: boolean }>) => {
      setClasses(data.map((c) => ({ id: c.id, name: c.name, active: c.active })))
    },
  )

  useEvent(
    EVENTS.CLASS.STUDENT_CREATED,
    (data: {
      id: number
      displayName: string
      firstName?: string | null
      lastName?: string | null
      pin: string
      labels: string[]
      classes: StudentClassRef[]
      birthdate?: string | null
      symbols?: string[]
      active?: boolean
    }) => {
      setStudents((prev) => [
        {
          id: data.id,
          displayName: data.displayName,
          firstName: data.firstName,
          lastName: data.lastName,
          classes: data.classes,
          birthdate: data.birthdate,
          active: data.active,
        },
        ...prev,
      ])
      setPinView({
        studentId: data.id,
        pin: data.pin,
        labels: data.labels,
        symbols: data.symbols,
      })
      toast.success(t("manager:schueler.created"))
    },
  )

  useEvent(EVENTS.CLASS.STUDENT_REMOVED, (data: { studentId: number }) => {
    setStudents((prev) => prev.filter((s) => s.id !== data.studentId))
    setPendingDeleteStudent(null)
    toast.success(t("manager:schueler.deleted"))
  })

  // Single active-toggle ack (WP-F2). Confirmed state, applied locally so the
  // badge/toggle flips immediately; the server re-list keeps it consistent.
  useEvent(
    SCHUELER_STUDENT_EVENTS.ACTIVE_SET,
    (data: { studentId: number; active: boolean }) => {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === data.studentId ? { ...s, active: data.active } : s,
        ),
      )
    },
  )

  useEvent(
    EVENTS.CLASS.STUDENT_MOVED,
    (data: { studentId: number; classId: number; joinedAt: string }) => {
      setStudents((prev) =>
        prev.map((s) => {
          if (s.id !== data.studentId) {
            return s
          }
          if (s.classes.some((c) => c.id === data.classId)) {
            return s
          }
          const targetClass = classes.find((c) => c.id === data.classId)
          return {
            ...s,
            classes: [
              ...s.classes,
              { id: data.classId, name: targetClass?.name ?? "" },
            ],
          }
        }),
      )
      toast.success(t("manager:classes.studentAdded"))
    },
  )

  useEvent(
    EVENTS.CLASS.REMOVED_FROM_CLASS,
    (data: { studentId: number; classId: number; studentDeleted: boolean }) => {
      if (data.studentDeleted) {
        setStudents((prev) => prev.filter((s) => s.id !== data.studentId))
      } else {
        setStudents((prev) =>
          prev.map((s) =>
            s.id === data.studentId
              ? {
                  ...s,
                  classes: s.classes.filter((c) => c.id !== data.classId),
                }
              : s,
          ),
        )
      }
      setPendingRemoveFromClass(null)
      toast.success(t("manager:schueler.removedFromClass"))
    },
  )

  useEvent(
    EVENTS.CLASS.STUDENT_PIN_DATA,
    (data: {
      studentId: number
      pin: string
      labels: string[]
      symbols?: string[]
    }) => {
      setPinView(data)
    },
  )

  useEvent(
    EVENTS.CLASS.PIN_REGENERATED,
    (data: {
      studentId: number
      pin: string
      labels: string[]
      symbols?: string[]
    }) => {
      setPinView(data)
      setPendingRegenPin(null)
      toast.success(t("manager:schueler.regenerated"))
    },
  )

  useEvent(EVENTS.CLASS.ERROR, (message: string) => {
    toast.error(t(message))
  })

  // Initial loads — gated on isConnected (namespace-connected + authed), never
  // on socket existence (repo gotcha).
  useEffect(() => {
    if (!isConnected) return

    socket.emit(EVENTS.CLASS.LIST_ALL_STUDENTS)
    socket.emit(EVENTS.CLASS.LIST)
  }, [isConnected, socket])

  // ---- Handlers ----

  const handleCreateStudent = useCallback(
    (firstName: string, lastName?: string | null, classIds?: number[], birthdate?: string): void => {
      if (!firstName.trim()) {
        toast.error(t("manager:classes.errorEmptyName"))
        return
      }
      // Dual-payload pattern: send computed displayName alongside firstName/lastName
      // so wire works with today's contract (uses displayName) and future v3 (uses firstName/lastName).
      const computedDisplayName = [firstName.trim(), lastName?.trim()]
        .filter(Boolean)
        .join(" ")
      const payload: CreateStudentPayload = {
        displayName: computedDisplayName,
        firstName: firstName.trim(),
        ...(lastName && lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(classIds && classIds.length > 0 ? { classIds } : {}),
        ...(birthdate ? { birthdate } : {}),
      }
      socket.emit(EVENTS.CLASS.CREATE_STUDENT, payload)
    },
    [socket, t],
  )

  const handleShowPin = useCallback(
    (studentId: number): void => {
      socket.emit(EVENTS.CLASS.STUDENT_PIN, { studentId })
    },
    [socket],
  )

  const handleRegenPin = useCallback((): void => {
    if (pendingRegenPin) {
      socket.emit(EVENTS.CLASS.REGEN_PIN, { studentId: pendingRegenPin.studentId })
    }
  }, [socket, pendingRegenPin])

  const handleDeleteStudent = useCallback((): void => {
    if (pendingDeleteStudent) {
      socket.emit(EVENTS.CLASS.REMOVE_STUDENT, pendingDeleteStudent.id)
    }
  }, [socket, pendingDeleteStudent])

  const handleRemoveFromClass = useCallback((): void => {
    if (pendingRemoveFromClass) {
      socket.emit(EVENTS.CLASS.REMOVE_FROM_CLASS, {
        studentId: pendingRemoveFromClass.studentId,
        classId: pendingRemoveFromClass.classId,
      })
    }
  }, [socket, pendingRemoveFromClass])

  const handleAddToClass = useCallback(
    (studentId: number, classId: number): void => {
      socket.emit(EVENTS.CLASS.MOVE_STUDENT, { studentId, classId })
    },
    [socket],
  )

  const handleSetStudentActive = useCallback(
    (studentId: number, active: boolean): void => {
      socket.emit(SCHUELER_STUDENT_EVENTS.SET_ACTIVE, { studentId, active })
    },
    [socket],
  )

  const clearPinView = useCallback(() => {
    setPinView(null)
  }, [])

  return {
    students: filteredStudents,
    filteredStudents,
    hasStudents: students.length > 0,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    classes: sortedClasses,
    pinView,
    clearPinView,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    pendingRemoveFromClass,
    setPendingRemoveFromClass,
    pendingRegenPin,
    setPendingRegenPin,
    handleCreateStudent,
    handleShowPin,
    handleRegenPin,
    handleDeleteStudent,
    handleRemoveFromClass,
    handleAddToClass,
    handleSetStudentActive,
  }
}
