import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import { EVENTS } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import CatalogPickerModal from "@razzia/web/features/quizz/components/CatalogPickerModal"
import QuizzEditorCard from "@razzia/web/features/quizz/components/QuizzEditorCard"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import useScreenSize from "@razzia/web/hooks/useScreenSize"
import clsx from "clsx"
import { BookmarkPlus, BookOpen, GripVertical, Plus } from "lucide-react"
import { useRef, useState } from "react"
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
    reorderQuestions,
    updateQuestion,
  } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { width } = useScreenSize()
  const [pickerOpen, setPickerOpen] = useState(false)

  // < md (768px): the rail collapses to a horizontal slide scroller above the
  // canvas; ≥ md it's a vertical rail beside it. The DnD `direction` follows so
  // drag math stays correct in both orientations.
  const isHorizontal = width < 768

  const isDragging = useRef(false)

  const handleSlideClick = (index: number) => () => {
    if (!isDragging.current) {
      setCurrentIndex(index)
    }
  }

  const handleDelete = (index: number) => () => {
    removeQuestion(index)
  }

  const handleDragEnd = (result: DropResult) => {
    isDragging.current = false

    if (
      !result.destination ||
      result.destination.index === result.source.index
    ) {
      return
    }

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

  return (
    <>
      <aside className="z-10 m-4 flex shrink-0 flex-row gap-2 overflow-x-auto overflow-y-hidden rounded-2xl bg-white p-3 shadow-sm md:max-h-[unset] md:w-72 md:flex-col md:overflow-x-hidden md:overflow-y-auto">
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
                          onClick={handleSlideClick(index)}
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

      <CatalogPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </>
  )
}

export default QuizzEditorSidebar
