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
}

export interface SchuelerStudent {
  id: number
  displayName: string
  classes: StudentClassRef[]
  // ADDENDUM (birthdate): optional, only present once the parallel contract
  // WP lands the field on the wire. Structurally optional so this hook
  // compiles cleanly against today's contract and picks the value up for
  // free the moment the server starts sending it.
  birthdate?: string | null
}

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
interface CreateStudentPayload {
  displayName: string
  classIds?: number[]
  birthdate?: string
}

export const useSchuelerManager = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [students, setStudents] = useState<SchuelerStudent[]>([])
  const [classes, setClasses] = useState<StudentClassRef[]>([])
  const [search, setSearch] = useState("")

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
    const query = search.trim().toLowerCase()
    if (query.length === 0) {
      return students
    }
    return students.filter(
      (s) =>
        s.displayName.toLowerCase().includes(query) ||
        s.classes.some((c) => c.name.toLowerCase().includes(query)),
    )
  }, [students, search])

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
    (data: Array<{ id: number; name: string }>) => {
      setClasses(data.map((c) => ({ id: c.id, name: c.name })))
    },
  )

  useEvent(
    EVENTS.CLASS.STUDENT_CREATED,
    (data: {
      id: number
      displayName: string
      pin: string
      labels: string[]
      classes: StudentClassRef[]
      birthdate?: string | null
      symbols?: string[]
    }) => {
      setStudents((prev) => [
        {
          id: data.id,
          displayName: data.displayName,
          classes: data.classes,
          birthdate: data.birthdate,
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
    (displayName: string, classIds: number[], birthdate?: string): void => {
      if (!displayName.trim()) {
        toast.error(t("manager:classes.errorEmptyName"))
        return
      }
      const payload: CreateStudentPayload = {
        displayName: displayName.trim(),
        ...(classIds.length > 0 ? { classIds } : {}),
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

  const clearPinView = useCallback(() => {
    setPinView(null)
  }, [])

  return {
    students: filteredStudents,
    hasStudents: students.length > 0,
    search,
    setSearch,
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
  }
}
