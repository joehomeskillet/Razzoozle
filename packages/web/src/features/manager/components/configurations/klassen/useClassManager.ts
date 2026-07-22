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
  ownerName?: string
  labelIds?: number[]
  active?: boolean
}

interface Student {
  id: number
  displayName: string
  firstName?: string | null
  lastName?: string | null
  createdAt?: string
  birthdate?: string | null
}

export interface AllStudent {
  id: number
  displayName: string
  firstName?: string | null
  lastName?: string | null
  classes: Array<{ id: number; name: string }>
  birthdate?: string | null
}

export const useClassManager = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()

  const [classes, setClasses] = useState<Class[]>([])
  const [allStudents, setAllStudents] = useState<AllStudent[]>([])
  const [search, setSearch] = useState("")

  const [pendingDeleteClass, setPendingDeleteClass] = useState<{
    id: number
    name: string
  } | null>(null)
  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<{
    studentId: number
    studentName: string
  } | null>(null)

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

  useEvent(EVENTS.CLASS.DATA, (data: Class[]) => {
    setClasses((prev) =>
      data.map((c) => ({
        ...c,
        students: c.students ?? prev.find((p) => p.id === c.id)?.students ?? [],
      })),
    )
  })

  useEvent(
    EVENTS.CLASS.STUDENTS_DATA,
    (data: { classId: number; students: Array<{ id: number; displayName: string; firstName?: string | null; lastName?: string | null }> }) => {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === data.classId
            ? { ...c, students: data.students }
            : c
        )
      )
    }
  )

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

  useEvent(EVENTS.CLASS.UPDATE_SUCCESS, () => {
    toast.success(t("manager:classes.updated"))
  })

  useEvent(EVENTS.CLASS.DELETE_SUCCESS, (data: { id: number }) => {
    setClasses((prev) => prev.filter((c) => c.id !== data.id))
    setPendingDeleteClass(null)
    toast.success(t("manager:classes.deleted"))
  })

  useEvent(EVENTS.CLASS.ALL_STUDENTS_DATA, (data: { students: AllStudent[] }) => {
    setAllStudents(data.students)
  })

  useEvent(
    EVENTS.CLASS.STUDENT_ADDED,
    (data: { id: number; displayName: string; firstName?: string | null; lastName?: string | null; classId: number }) => {
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

  useEvent(
    EVENTS.CLASS.STUDENT_UPDATED,
    (data: { id: number; displayName: string; firstName?: string | null; lastName?: string | null; birthdate?: string | null }) => {
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

  useEvent(
    EVENTS.LABEL.ASSIGNED,
    (data: { entityType: string; entityId: string }) => {
      if (data.entityType === "class") {
        socket.emit(EVENTS.CLASS.LIST)
      }
    }
  )

  useEvent(EVENTS.CLASS.BULK_ACTIVE_SET, (data: { succeeded: number[]; failed: Array<{ id: number; reason: string }> }) => {
    const totalSucceeded = data.succeeded.length
    const totalFailed = data.failed.length
    if (totalSucceeded > 0) {
      toast.success(t("manager:bulk.resultSucceeded", { count: totalSucceeded }))
    }
    if (totalFailed > 0) {
      toast.error(t("manager:bulk.resultFailed", { count: totalFailed }))
    }
    socket.emit(EVENTS.CLASS.LIST)
  })

  useEvent(EVENTS.CLASS.BULK_DELETED, (data: { succeeded: number[]; failed: Array<{ id: number; reason: string }> }) => {
    const totalSucceeded = data.succeeded.length
    const totalFailed = data.failed.length
    if (totalSucceeded > 0) {
      toast.success(t("manager:bulk.resultSucceeded", { count: totalSucceeded }))
    }
    if (totalFailed > 0) {
      toast.error(t("manager:bulk.resultFailed", { count: totalFailed }))
    }
    socket.emit(EVENTS.CLASS.LIST)
  })

  useEvent(EVENTS.CLASS.ERROR, (message: string) => {
    toast.error(t(message))
  })

  useEffect(() => {
    if (!isConnected) return
    socket.emit(EVENTS.CLASS.LIST)
    socket.emit(EVENTS.CLASS.LIST_ALL_STUDENTS)
  }, [isConnected, socket])

  const handleFetchStudents = useCallback((classId: number) => {
    socket.emit(EVENTS.CLASS.GET_STUDENTS, classId)
  }, [socket])

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

  const handleUpdateStudent = (
    studentId: number,
    firstName: string,
    lastName?: string | null,
    birthdate?: string,
  ): void => {
    if (!firstName.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    const computedDisplayName = [firstName.trim(), lastName?.trim()]
      .filter(Boolean)
      .join(" ")
    const payload: { id: number; displayName: string; firstName?: string | null; lastName?: string | null; birthdate?: string } = {
      id: studentId,
      displayName: computedDisplayName,
      firstName: firstName.trim(),
      ...(lastName && lastName.trim() ? { lastName: lastName.trim() } : {}),
      ...(birthdate ? { birthdate } : {}),
    }
    socket.emit(EVENTS.CLASS.UPDATE_STUDENT, payload)
  }

  const handleAssignLabels = useCallback(
    (classId: number, labelIds: number[]): void => {
      socket.emit(EVENTS.LABEL.ASSIGN, {
        entityType: "class",
        entityId: String(classId),
        labelIds,
      })
    },
    [socket],
  )

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
    handleAssignLabels,
  }
}
