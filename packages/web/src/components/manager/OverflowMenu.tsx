import Button from "@razzoozle/web/components/Button"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"
import { MoreVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

export interface OverflowMenuProps {
  actions: ListRowAction[]
}

const OverflowMenu = ({ actions }: OverflowMenuProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose()
    }
  }

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
  }, [open])

  return (
    <div className="relative shrink-0" onKeyDown={handleKeyDown}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t("manager:quizz.moreActions")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="shrink-0 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-muted)]"
      >
        <MoreVertical className="size-5" aria-hidden />
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleClose}
            aria-hidden
          />
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 min-w-40 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] shadow-md"
          >
            {actions.map(({ key, icon: Icon, label, onClick, disabled, destructive }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  onClick()
                  handleClose()
                }}
                disabled={disabled}
                aria-label={label}
                data-testid={key}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-3)] cursor-pointer"
                } ${
                  destructive
                    ? "text-[var(--state-wrong)] hover:bg-[var(--state-wrong-soft)]"
                    : "text-[var(--ink-muted)]"
                }`}
              >
                <Icon className="size-5 flex-shrink-0" aria-hidden />
                <span className="flex-1 text-left">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default OverflowMenu
