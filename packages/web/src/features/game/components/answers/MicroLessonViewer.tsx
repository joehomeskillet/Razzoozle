import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface MicroLessonSlide {
  id: string
  title: string
  content: string
  type: "text" | "image" | "video"
  mediaUrl?: string
}

export interface MicroLessonViewerProps {
  slides: MicroLessonSlide[]
  onComplete?: () => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function MicroLessonViewer({
  slides,
  onComplete,
  disabled = false,
  testIdPrefix = "",
  className,
}: MicroLessonViewerProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentSlide = slides[currentIndex]
  const isFirst = currentIndex === 0
  const isLast = currentIndex === slides.length - 1

  const handleNext = () => {
    if (isLast) {
      onComplete?.()
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  if (!currentSlide) {
    return null
  }

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}microlesson-container`}
    >
      {/* Header & Progress Indicator */}
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {t("game:microLesson.slideCounter", {
            defaultValue: "Folie {{current}} von {{total}}",
            current: currentIndex + 1,
            total: slides.length,
          })}
        </span>

        <div className="flex gap-1.5" data-testid={`${testIdPrefix}microlesson-dots`}>
          {slides.map((slide, idx) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => !disabled && setCurrentIndex(idx)}
              className={clsx(
                "h-2 rounded-full transition-all",
                idx === currentIndex
                  ? "w-6 bg-[var(--color-primary)]"
                  : "w-2 bg-[var(--surface-4)] hover:bg-[var(--surface-3)]",
              )}
              aria-label={t("game:microLesson.goToSlide", {
                defaultValue: "Zu Folie {{index}} wechseln",
                index: idx + 1,
              })}
            />
          ))}
        </div>
      </div>

      {/* Slide Body */}
      <div
        className="flex min-h-[220px] flex-col gap-4 py-2"
        data-testid={`${testIdPrefix}microlesson-slide-${currentSlide.id}`}
      >
        <h3 className="text-xl font-bold text-[var(--ink)]">
          {currentSlide.title}
        </h3>

        {currentSlide.mediaUrl && (
          <div className="overflow-hidden rounded-lg bg-[var(--surface-2)]">
            {currentSlide.type === "image" && (
              <img
                src={currentSlide.mediaUrl}
                alt={currentSlide.title}
                className="max-h-64 w-full object-contain"
              />
            )}
          </div>
        )}

        <p className="whitespace-pre-line text-base text-[var(--ink-medium)]">
          {currentSlide.content}
        </p>
      </div>

      {/* Controls Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || isFirst}
          onClick={handlePrev}
          data-testid={`${testIdPrefix}microlesson-prev`}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("game:microLesson.prev", { defaultValue: "Zurück" })}
        </Button>

        <Button
          type="button"
          variant="primary"
          disabled={disabled}
          onClick={handleNext}
          data-testid={`${testIdPrefix}microlesson-next`}
        >
          {isLast ? (
            <>
              <CheckCircle className="mr-1 h-4 w-4" />
              {t("game:microLesson.complete", { defaultValue: "Lektion abschließen" })}
            </>
          ) : (
            <>
              {t("game:microLesson.next", { defaultValue: "Weiter" })}
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
