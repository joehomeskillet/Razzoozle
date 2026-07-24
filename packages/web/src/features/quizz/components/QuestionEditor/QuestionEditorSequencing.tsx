import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const QuestionEditorSequencing = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const items = currentQuestion.items ?? []
  const correctOrder = currentQuestion.correctOrder ?? []
  const [newItemLabel, setNewItemLabel] = useState("")

  // Get items in the order defined by correctOrder
  const orderedItems = correctOrder
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean) as typeof items

  const updateItemLabel = (id: string, label: string) => {
    const next = items.map((item) => (item.id === id ? { ...item, label } : item))
    updateQuestion(currentIndex, { items: next })
  }

  const addItem = () => {
    if (items.length >= 16) {
      return
    }
    const newId = crypto.randomUUID()
    const newItems = [...items, { id: newId, label: "" }]
    const newOrder = [...correctOrder, newId]
    updateQuestion(currentIndex, { items: newItems, correctOrder: newOrder })
    setNewItemLabel("")
  }

  const removeItem = (id: string) => {
    if (items.length <= 2) {
      return
    }
    const nextItems = items.filter((item) => item.id !== id)
    const nextOrder = correctOrder.filter((orderId) => orderId !== id)
    updateQuestion(currentIndex, { items: nextItems, correctOrder: nextOrder })
  }

  const moveItemUp = (id: string) => {
    const idx = correctOrder.indexOf(id)
    if (idx <= 0) {
      return
    }
    const next = [...correctOrder]
    const temp = next[idx]!
    next[idx] = next[idx - 1]!
    next[idx - 1] = temp
    updateQuestion(currentIndex, { correctOrder: next })
  }

  const moveItemDown = (id: string) => {
    const idx = correctOrder.indexOf(id)
    if (idx >= correctOrder.length - 1) {
      return
    }
    const next = [...correctOrder]
    const temp = next[idx]!
    next[idx] = next[idx + 1]!
    next[idx + 1] = temp
    updateQuestion(currentIndex, { correctOrder: next })
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">
            {t("quizz:sequencing.itemsLabel", {
              defaultValue: "Items to order",
            })}
          </label>
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= 16}
            aria-label={t("quizz:sequencing.addItem", {
              defaultValue: "Add item",
            })}
            className="focus-visible:ring-primary/30 flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {orderedItems.map((item) => (
            <div key={item.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => moveItemUp(item.id)}
                disabled={correctOrder.indexOf(item.id) === 0}
                aria-label={t("quizz:sequencing.moveUp", {
                  defaultValue: "Move up",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => moveItemDown(item.id)}
                disabled={
                  correctOrder.indexOf(item.id) === correctOrder.length - 1
                }
                aria-label={t("quizz:sequencing.moveDown", {
                  defaultValue: "Move down",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <ArrowDown className="size-4" />
              </button>
              <input
                className="focus-visible:border-primary focus-visible:ring-primary/30 flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:ring-2"
                placeholder={t("quizz:sequencing.itemPlaceholder", {
                  defaultValue: "Item text",
                })}
                value={item.label}
                onChange={(e) => updateItemLabel(item.id, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 2}
                aria-label={t("quizz:sequencing.removeItem", {
                  defaultValue: "Remove item",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <Minus className="size-5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-600">
          {t("quizz:sequencing.preview", {
            defaultValue: "Players will order these items",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {orderedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              {item.label || "—"}
            </span>
          ))}
        </div>
      </div>

      {items.length < 2 && (
        <p className="text-sm text-amber-700">
          {t("quizz:sequencing.minItemsRequired", {
            defaultValue: "At least 2 items required",
          })}
        </p>
      )}
    </div>
  )
}

export default QuestionEditorSequencing
