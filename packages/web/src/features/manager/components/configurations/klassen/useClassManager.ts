import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Class {
  id: number
  name: string
  createdAt: string
  students?: Student[]
}

interface Student {
  id: number
  displayName: string
  createdAt?: string
}

export const useClassManager = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()

  const [classes, setClasses] = useState<Class[]>([])
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
    setClasses(data.map((c) => ({ ...c, students: [] })))
  })

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
  useEvent(EVENTS.CLASS.DELETE_SUCCESS, () => {
    setPendingDeleteClass(null)
    toast.success(t("manager:classes.deleted"))
  })

  // Listen for student additions
  useEvent(
    EVENTS.CLASS.STUDENT_ADDED,
    (data: { id: number; displayName: string }) => {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === pendingDeleteStudent?.studentId
            ? c
            : {
                ...c,
                students: [
                  ...(c.students ?? []),
                  {
                    id: data.id,
                    displayName: data.displayName,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
        )
      )
      toast.success(t("manager:classes.studentAdded"))
    }
  )

  // Listen for student removals
  useEvent(EVENTS.CLASS.STUDENT_REMOVED, () => {
    setPendingDeleteStudent(null)
    toast.success(t("manager:classes.studentRemoved"))
  })

  // Listen for student updates
  useEvent(EVENTS.CLASS.STUDENT_UPDATED, () => {
    toast.success(t("manager:classes.studentUpdated"))
  })

  // Listen for errors
  useEvent(EVENTS.CLASS.ERROR, (message: string) => {
    toast.error(t(message))
  })

  // Request class list on mount
  useEffect(() => {
    socket.emit(EVENTS.CLASS.LIST)
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

  const handleAddStudent = (classId: number, displayName: string): void => {
    if (!displayName.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    socket.emit(EVENTS.CLASS.ADD_STUDENT, { classId, displayName })
  }

  const handleDeleteStudent = (): void => {
    if (pendingDeleteStudent) {
      socket.emit(EVENTS.CLASS.REMOVE_STUDENT, pendingDeleteStudent.studentId)
    }
  }

  const handleUpdateStudent = (studentId: number, displayName: string): void => {
    if (!displayName.trim()) {
      toast.error(t("manager:classes.errorEmptyName"))
      return
    }
    socket.emit(EVENTS.CLASS.UPDATE_STUDENT, { id: studentId, displayName })
  }

  return {
    classes: filteredClasses,
    search,
    setSearch,
    pendingDeleteClass,
    setPendingDeleteClass,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    handleCreateClass,
    handleUpdateClass,
    handleDeleteClass,
    handleAddStudent,
    handleDeleteStudent,
    handleUpdateStudent,
  }
}
