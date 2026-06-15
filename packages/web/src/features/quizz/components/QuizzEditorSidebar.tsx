import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import { EVENTS } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import CatalogPickerModal from "@razzoozle/web/features/quizz/components/CatalogPickerModal"
import QuizzEditorCard from "@razzoozle/web/features/quizz/components/QuizzEditorCard"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import useScreenSize from "@razzoozle/web/hooks/useScreenSize"
import clsx from "clsx"
import {
  BookmarkPlus,
  BookOpen,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { type MouseEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const actionButtonClass =
  "focus-visible:outline-primary flex min-h-11 w-36 shrink-0 items-center justify-center gap-1 self-center bg-gray-100 font-semibold text-gray-700 hover:bg-gray-200 md:mt-1 md:w-full"

const QuizzEditorSidebar = () => {
  const {
    questions,
    currentIndex,
    currentQuestion,
    setCurrentIndex,
    addQuestion,
    removeQuestion,
    removeQuestions,
    reorderQuestions,
    updateQuestion,
  } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { width } = useScreenSize()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Multi-select state. `selected` is the working set; `anchor` is the pivot for
  // Shift+click range selection (set on the last plain/ctrl click).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)

  // < md (768px): the rail collapses to a horizontal slide scroller above the
  // canvas; ≥ md it's a vertical rail beside it. The DnD `direction` follows so
  // drag math stays correct in both orientations.
  const isHorizontal = width < 768

  const isDragging = useRef(false)

  const clearSelection = () => {
    setSelected(new Set())
    setAnchor(null)
  }

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)

      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }

      return next
    })
    setAnchor(index)
  }

  const selectRange = (from: number, to: number) => {
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const next = new Set<number>()

    for (let i = lo; i <= hi; i++) {
      next.add(i)
    }

    setSelected(next)
  }

  const handleSlideClick =
    (index: number) => (event: MouseEvent<HTMLDivElement>) => {
      if (isDragging.current) {
        return
      }

      // Ctrl (Win/Linux) / Cmd (macOS) → toggle membership, keep the rest.
      if (event.ctrlKey || event.metaKey) {
        toggleSelect(index)

        return
      }

      // Shift → contiguous range from the anchor (or this card if no anchor).
      if (event.shiftKey) {
        selectRange(anchor ?? index, index)
        setCurrentIndex(index)

        return
      }

      // Plain click → single-select (clears any multi-selection) and focuses
      // the slide in the canvas, exactly as before.
      clearSelection()
      setCurrentIndex(index)
    }

  const handleDelete = (index: number) => () => {
    removeQuestion(index)
    setSelected((prev) => {
      if (!prev.has(index)) {
        return prev
      }

      const next = new Set(prev)
      next.delete(index)

      return next
    })
  }

  const handleDragEnd = (result: DropResult) => {
    isDragging.current = false

    if (
      !result.destination ||
      result.destination.index === result.source.index
    ) {
      return
    }

    // Reordering invalidates index-based selection; clear it to avoid the set
    // pointing at the wrong slides after the move.
    clearSelection()
    reorderQuestions(result.source.index, result.destination.index)
  }

  const handlePick = (question: Question) => {
    const newIndex = questions.length

    addQuestion()
    updateQuestion(newIndex, question)
    toast.success(t("manager:catalog.insertSuccess"))
  }

  const handleSaveToCatalog = () => {
    const { id: _id, ...question } = currentQuestion

    socket.emit(EVENTS.CATALOG.ADD, { question, source: "editor" })
    toast.success(t("manager:catalog.saved"))
  }

  const handleBulkSaveToCatalog = () => {
    const indices = [...selected].sort((a, b) => a - b)

    indices.forEach((index) => {
      const target = questions[index]

      if (!target) {
        return
      }

      const { id: _id, ...question } = target
      socket.emit(EVENTS.CATALOG.ADD, { question, source: "editor" })
    })

    toast.success(t("manager:catalog.saved"))
  }

  const handleBulkDelete = () => {
    removeQuestions([...selected])
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const selectionActive = selected.size > 0

  return (
    <>
      <aside className="z-10 m-4 flex shrink-0 flex-row gap-2 overflow-x-auto overflow-y-hidden rounded-2xl bg-white p-3 shadow-sm md:max-h-[unset] md:w-72 md:flex-col md:overflow-x-hidden md:overflow-y-auto">
        {selectionActive && (
          <div
            role="toolbar"
            aria-label={t("quizz:bulkSelected", { count: selected.size })}
            className="order-first flex shrink-0 flex-col gap-2 rounded-xl bg-gray-50 p-2 md:sticky md:top-0 md:z-20"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-700">
                {t("quizz:bulkSelected", { count: selected.size })}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                aria-label={t("common:cancel")}
                className="focus-visible:outline-primary rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkSaveToCatalog}
              classNameContent="min-w-0 gap-1"
            >
              <BookmarkPlus className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {t("quizz:bulkToCatalog")}
              </span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setBulkDeleteOpen(true)}
              classNameContent="min-w-0 gap-1"
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{t("quizz:bulkDelete")}</span>
            </Button>
          </div>
        )}

        <DragDropContext
          onDragStart={() => {
            isDragging.current = true
          }}
          onDragEnd={handleDragEnd}
        >
          <Droppable
            droppableId="questions"
            direction={isHorizontal ? "horizontal" : "vertical"}
          >
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-row gap-2 md:flex-col"
              >
                {questions.map((q, index) => (
                  <Draggable key={q.id} draggableId={q.id} index={index}>
                    {(draggableProvided, snapshot) => (
                      <div
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        className={clsx(
                          "group relative w-36 shrink-0 md:w-auto",
                          snapshot.isDragging && "shadow-lg",
                        )}
                      >
                        {/*
                          Dedicated drag handle. Spreading dragHandleProps here
                          keeps the library's keyboard sensor wiring intact
                          (tabIndex, role, aria-describedby, onKeyDown, draggable):
                          focus the handle, press Space to lift, arrows to move,
                          Space to drop. The card itself stays a separate
                          role="button" for slide selection.
                        */}
                        <button
                          type="button"
                          {...draggableProvided.dragHandleProps}
                          aria-label={t("quizz:reorderSlideLabel", {
                            index: index + 1,
                          })}
                          className="absolute top-1/2 left-0.5 z-10 -translate-y-1/2 rounded-sm bg-white/90 p-0.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-600 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                        >
                          <GripVertical className="size-3.5" />
                        </button>
                        <QuizzEditorCard
                          question={q}
                          index={index}
                          isActive={currentIndex === index}
                          canDelete={questions.length > 1}
                          selected={selected.has(index)}
                          selectionActive={selectionActive}
                          onClick={handleSlideClick(index)}
                          onToggleSelect={() => toggleSelect(index)}
                          onDelete={handleDelete(index)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <Button
          size="sm"
          onClick={addQuestion}
          className={clsx(actionButtonClass, "md:mb-2")}
          classNameContent="min-w-0 gap-1"
        >
          <Plus className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 whitespace-normal text-center leading-tight">
            {t("quizz:addQuestion")}
          </span>
        </Button>
        <Button
          size="sm"
          onClick={() => setPickerOpen(true)}
          className={actionButtonClass}
          classNameContent="min-w-0 gap-1"
        >
          <BookOpen className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 whitespace-normal text-center leading-tight">
            {t("manager:catalog.insert")}
          </span>
        </Button>
        <Button
          size="sm"
          onClick={handleSaveToCatalog}
          className={clsx(actionButtonClass, "md:mb-2")}
          classNameContent="min-w-0 gap-1"
        >
          <BookmarkPlus className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 whitespace-normal text-center leading-tight">
            {t("manager:catalog.saveToCatalog")}
          </span>
        </Button>
      </aside>

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("quizz:bulkDelete")}
        description={t("quizz:bulkDeleteConfirm")}
        confirmLabel={t("common:delete")}
        onConfirm={handleBulkDelete}
      />

      <CatalogPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </>
  )
}

export default QuizzEditorSidebar
