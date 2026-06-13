import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import Button from "@razzia/web/components/Button"
import QuizzEditorCard from "@razzia/web/features/quizz/components/QuizzEditorCard"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import useScreenSize from "@razzia/web/hooks/useScreenSize"
import clsx from "clsx"
import { GripVertical, Plus } from "lucide-react"
import { useRef } from "react"
import { useTranslation } from "react-i18next"

const QuizzEditorSidebar = () => {
  const {
    questions,
    currentIndex,
    setCurrentIndex,
    addQuestion,
    removeQuestion,
    reorderQuestions,
  } = useQuizzEditor()
  const { t } = useTranslation()
  const { width } = useScreenSize()

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

  return (
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
        className="focus-visible:outline-primary flex min-h-11 w-36 shrink-0 items-center justify-center gap-1 self-center bg-gray-100 font-semibold text-gray-700 hover:bg-gray-200 md:mt-1 md:mb-2 md:w-full"
      >
        <Plus className="size-5" />
        {t("quizz:addQuestion")}
      </Button>
    </aside>
  )
}

export default QuizzEditorSidebar
