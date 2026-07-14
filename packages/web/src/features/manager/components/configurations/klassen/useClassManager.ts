import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Class {
  id: number
  name: string
  createdAt: string
  studentCount?: number
  students?: Student[]
}

interface Student {
  id: number
  displayName: string
  firstName?: string
  lastName?: string
  createdAt?: string
  // ADDENDUM (birthdate): optional — only present once the parallel contract
  // WP lands the field on the wire. Structurally optional so this hook
  // compiles cleanly against today's contract and picks it up for free the
  // moment the server starts sending it.
  birthdate?: string | null
}

// All of the manager's own students (across every class), used to feed the
// "Schüler hinzufügen" picker — the source of truth is ALL_STUDENTS_DATA, not
// the per-class `students` arrays (which are only populated once a row has
// been expanded).
export interface AllStudent {
  id: number
  displayName: string
  firstName?: string
  lastName?: string
  classes: Array<{ id: number; name: string }>
  birthdate?: string | null
}

export const useClassManager = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [classes, setClasses] = useState<Class[]>([])
  const [allStudents, setAllStudents] = useState<AllStudent[]>([])
  const [search, setSearch] = useState("")

  // Pending actions for confirmation dialogs
  const [pendingDeleteClass, setPendingDeleteClass] = useState<{
    id: number
    name: string
  } | null>(null)
  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<{
    studentId: number
    studentName: string
  } | null>(null)

  // Filter classes by search
  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) {
      return classes
    }
    return classes.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      (c.students ?? []).some((s) =>
        s.displayName.toLowerCase().includes(query)
      )
    )
  }, [classes, search])

  // Listen for class data
  useEvent(EVENTS.CLASS.DATA, (data: Class[]) => {
    setClasses((prev) =>
      data.map((c) => ({
        ...c,
        students: c.students ?? prev.find((p) => p.id === c.id)?.students ?? [],
      })),
    )
  })

  // Listen for fetched students
  useEvent(
    EVENTS.CLASS.STUDENTS_DATA,
    (data: { classId: number; students: Array<{ id: number; displayName: string; firstName?: string; lastName?: string }> }) => {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === data.classId
            ? { ...c, students: data.students }
            : c
        )
      )
    }
  )

  // Listen for class creation
  useEvent(
    EVENTS.CLASS.CREATE_SUCCESS,
    (data: { id: number; name: string }) => {
      const newClass: Class = {
        id: data.id,
        name: data.name,
        createdAt: new Date().toISOString(),
        students: [],
      }
      setClasses((prev) => [newClass, ...prev])
      toast.success(t("manager:classes.created"))
    }
  )

  // Listen for class updates
  useEvent(EVENTS.CLASS.UPDATE_SUCCESS, () => {
    toast.success(t("manager:classes.updated"))
  })

  // Listen for class deletion
  useEvent(EVENTS.CLASS.DELETE_SUCCESS, (data: { id: number }) => {
    setClasses((prev) => prev.filter((c) => c.id !== data.id))
    setPendingDeleteClass(null)
    toast.success(t("manager:classes.deleted"))
  })

  // Listen for the manager's full roster (feeds the "Schüler hinzufügen" picker).
  useEvent(EVENTS.CLASS.ALL_STUDENTS_DATA, (data: { students: AllStudent[] }) => {
    setAllStudents(data.students)
  })

  // Listen for student additions. Also patches the collapsed row's cached
  // studentCount — previously only the expanded `students` array grew, so a
  // collapsed row kept showing a stale count.
  useEvent(
    EVENTS.CLASS.STUDENT_ADDED,
    (data: { id: number; displayName: string; firstName?: string; lastName?: string; classId: number }) => {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === data.classId
            ? {
                ...c,
                studentCount: (c.studentCount ?? (c.students ?? []).length) + 1,
                students: [
                  ...(c.students ?? []),
                  {
                    id: data.id,
                    displayName: data.displayName,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : c
        )
      )
      toast.success(t("manager:classes.studentAdded"))
    }
  )

  // Listen for student removals. Decrements studentCount for whichever class
  // actually had the student loaded (same stale-count bug as STUDENT_ADDED).
  useEvent(EVENTS.CLASS.STUDENT_REMOVED, (data: { studentId: number }) => {
    setClasses((prev) =>
      prev.map((c) => {
        const hadStudent = (c.students ?? []).some((s) => s.id === data.studentId)
        return {
          ...c,
          studentCount: hadStudent
            ? Math.max(0, (c.studentCount ?? (c.students ?? []).length) - 1)
            : c.studentCount,
          students: (c.students ?? []).filter((s) => s.id !== data.studentId),
        }
      })
    )
    setPendingDeleteStudent(null)
    toast.success(t("manager:classes.studentRemoved"))
  })

  // Listen for a student joining an ADDITIONAL class via the picker
  // (MOVE_STUDENT). Increments the target class's studentCount and, if that
  // row is already expanded, appends the student to its loaded list too.
  useEvent(
    EVENTS.CLASS.STUDENT_MOVED,
    (data: { studentId: number; classId: number; joinedAt: string }) => {
      setClasses((prev) =>
        prev.map((c) => {
          if (c.id !== data.classId) {
            return c
          }
          if (c.students === undefined) {
            return { ...c, studentCount: (c.studentCount ?? 0) + 1 }
          }
          if (c.students.some((s) => s.id === data.studentId)) {
            return c
          }
          const student = allStudents.find((s) => s.id === data.studentId)
          return {
            ...c,
            studentCount: (c.studentCount ?? c.students.length) + 1,
            students: [
              ...c.students,
              {
                id: data.studentId,
                displayName: student?.displayName ?? "",
                firstName: student?.firstName,
                lastName: student?.lastName,
                createdAt: data.joinedAt,
              },
            ],
          }
        })
      )
    }
  )

  // Listen for student updates
  useEvent(
    EVENTS.CLASS.STUDENT_UPDATED,
    (data: { id: number; displayName: string; firstName?: string; lastName?: string; birthdate?: string | null }) => {
      setClasses((prev) =>
        prev.map((c) => ({
          ...c,
          students: (c.students ?? []).map((s) =>
            s.id === data.id
              ? {
                  ...s,
                  displayName: data.displayName,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  birthdate: data.birthdate,
                }
              : s
          ),
        }))
      )
      toast.success(t("manager:classes.studentUpdated"))
    }
  )

  // Listen for errors
  useEvent(EVENTS.CLASS.ERROR, (message: string) => {
    toast.error(t(message))
  })

  // Request class list + full roster when namespace connects and authenticates
  useEffect(() => {
    if (!isConnected) return

    socket.emit(EVENTS.CLASS.LIST)
    socket.emit(EVENTS.CLASS.LIST_ALL_STUDENTS)
    // The socket may connect before this effect subscribes; gating on
    // isConnected (namespace-connected + authed) and re-emitting on each
    // isConnected flip is the correct load trigger (mirrors manager/index.tsx).
  }, [isConnected, socket])

  // Fetch students for a class
  const handleFetchStudents = useCallback((classId: number) => {
    socket.emit(EVENTS.CLASS.GET_STUDENTS, classId)
  }, [socket])

  // Handlers for class operations
  const handleCreateClass = (name: string): void => {
    if (!name.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    socket.emit(EVENTS.CLASS.CREATE, { name })
  }

  const handleUpdateClass = (id: number, name: string): void => {
    if (!name.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    socket.emit(EVENTS.CLASS.UPDATE, { id, name })
  }

  const handleDeleteClass = (): void => {
    if (pendingDeleteClass) {
      socket.emit(EVENTS.CLASS.DELETE, pendingDeleteClass.id)
    }
  }

  // Picker (replaces the old free-text add-student dialog): adds an EXISTING
  // student to an additional class via MOVE_STUDENT.
  const handleMoveStudent = useCallback(
    (studentId: number, classId: number): void => {
      socket.emit(EVENTS.CLASS.MOVE_STUDENT, { studentId, classId })
    },
    [socket],
  )

  const handleDeleteStudent = (): void => {
    if (pendingDeleteStudent) {
      socket.emit(EVENTS.CLASS.REMOVE_STUDENT, pendingDeleteStudent.studentId)
    }
  }

  // ADDENDUM (N2): dual-payload pattern sends computed displayName alongside
  // firstName/lastName so wire works with today's contract (uses displayName)
  // and future v3 (server prefers firstName/lastName, falls back to displayName).
  const handleUpdateStudent = (
    studentId: number,
    firstName: string,
    lastName?: string,
    birthdate?: string,
  ): void => {
    if (!firstName.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    const computedDisplayName = [firstName.trim(), lastName?.trim()]
      .filter(Boolean)
      .join(" ")
    const payload: { id: number; displayName: string; firstName?: string; lastName?: string; birthdate?: string } = {
      id: studentId,
      displayName: computedDisplayName,
      firstName: firstName.trim(),
      ...(lastName && lastName.trim() ? { lastName: lastName.trim() } : {}),
      ...(birthdate ? { birthdate } : {}),
    }
    socket.emit(EVENTS.CLASS.UPDATE_STUDENT, payload)
  }

  return {
    classes: filteredClasses,
    allStudents,
    search,
    setSearch,
    pendingDeleteClass,
    setPendingDeleteClass,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    handleCreateClass,
    handleUpdateClass,
    handleDeleteClass,
    handleMoveStudent,
    handleDeleteStudent,
    handleUpdateStudent,
    handleFetchStudents,
  }
}
