import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import Button from "@razzoozle/web/components/Button"
import Radio from "@razzoozle/web/components/Radio"
import { useTranslation } from "react-i18next"
import { useCallback, useMemo, useRef, useState } from "react"
import { useSchuelerManager } from "./useSchuelerManager"
import { useClassManager } from "../klassen/useClassManager"
import * as Select from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import PrintSheets from "./PrintSheets"
import PrintSummary from "./PrintSummary"

interface PrintCredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LOGIN_URL = "https://razzoozle.joelduss.xyz" // TODO: env var

const PrintCredentialsDialog = ({ open, onOpenChange }: PrintCredentialsDialogProps) => {
  const { t } = useTranslation()
  const { students } = useSchuelerManager()
  const { classes } = useClassManager()
  const printContainerRef = useRef<HTMLDivElement>(null)

  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [scope, setScope] = useState<"active" | "all" | "selected">("active")
  const [format, setFormat] = useState<"sheets" | "summary">("sheets")
  const [isPrinting, setIsPrinting] = useState(false)

  // Classes with students
  const classesWithStudents = useMemo(() => {
    return classes.filter(c => {
      const classStudents = students.filter(s => s.classes.some(cls => cls.id === c.id))
      return classStudents.length > 0
    })
  }, [classes, students])

  // Set default class on open
  useMemo(() => {
    if (open && classesWithStudents.length > 0 && !selectedClassId) {
      setSelectedClassId(String(classesWithStudents[0].id))
    }
  }, [open, classesWithStudents, selectedClassId])

  const selectedClass = classesWithStudents.find(c => c.id === Number(selectedClassId))

  // Collect PIN data (placeholder for now - requires server integration)
  const pinDataMap = useMemo(() => {
    const map = new Map()
    // TODO: fetch from server or context
    students.forEach(s => {
      map.set(s.id, {
        studentId: s.id,
        pin: "****",
        labels: [],
        symbols: []
      })
    })
    return map
  }, [students])

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return []
    return students.filter(s => s.classes.some(cls => cls.id === selectedClass.id))
  }, [selectedClass, students])

  const handlePrint = useCallback(() => {
    setIsPrinting(true)
    // Use window.print() after render
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
      onOpenChange(false)
    }, 100)
  }, [onOpenChange])

  return (
    <>
      <DialogPanel
        open={open && !isPrinting}
        onOpenChange={onOpenChange}
        titleId="print-credentials-dialog-title"
        title={t("manager:schueler.printDialogTitle")}
      >
        <div className="space-y-4">
          {/* Class Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t("manager:classes.selectAll")}
            </label>
            <Select.Root value={selectedClassId} onValueChange={setSelectedClassId}>
              <Select.Trigger
                data-testid="print-dialog-class-select"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-white px-3 text-sm"
              >
                <Select.Value />
                <ChevronDown className="size-4" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content
                  position="popper"
                  className="z-50 min-w-40 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-white shadow-lg"
                >
                  <Select.Viewport className="p-1">
                    {classesWithStudents.map(c => (
                      <Select.Item
                        key={c.id}
                        value={String(c.id)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-2)] cursor-pointer"
                      >
                        <Select.ItemText>{c.name}</Select.ItemText>
                        <Check className="size-4 ml-auto" />
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {/* Scope */}
          <fieldset>
            <legend className="block text-sm font-medium mb-2">{t("manager:schueler.printScope")}</legend>
            <div className="space-y-2">
              <Radio
                name="scope"
                value="active"
                checked={scope === "active"}
                onChange={(e) => setScope(e.target.value as "active")}
                data-testid="print-scope-active"
                label={t("manager:schueler.printScopeActiveOnly")}
              />
              <Radio
                name="scope"
                value="all"
                checked={scope === "all"}
                onChange={(e) => setScope(e.target.value as "all")}
                data-testid="print-scope-all"
                label={t("manager:schueler.printScopeAll")}
              />
              <Radio
                name="scope"
                value="selected"
                checked={scope === "selected"}
                onChange={(e) => setScope(e.target.value as "selected")}
                data-testid="print-scope-selected"
                disabled
                label={`${t("manager:schueler.printScopeSelected")} (0)`}
              />
            </div>
          </fieldset>

          {/* Format */}
          <fieldset>
            <legend className="block text-sm font-medium mb-2">{t("manager:schueler.printFormat")}</legend>
            <div className="space-y-2">
              <Radio
                name="format"
                value="sheets"
                checked={format === "sheets"}
                onChange={(e) => setFormat(e.target.value as "sheets")}
                data-testid="print-format-sheets"
                label={t("manager:schueler.printFormatSheets")}
              />
              <Radio
                name="format"
                value="summary"
                checked={format === "summary"}
                onChange={(e) => setFormat(e.target.value as "summary")}
                data-testid="print-format-summary"
                label={t("manager:schueler.printFormatSummary")}
              />
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            disabled={!selectedClass || isPrinting}
            aria-label={selectedClass ? t("manager:schueler.printCredentials") : ""}
          >
            {t("common:print")}
          </Button>
        </div>
      </DialogPanel>

      {/* Hidden print container */}
      <div ref={printContainerRef} className="no-print" style={{ display: "none" }}>
        {format === "sheets" ? (
          <PrintSheets students={filteredStudents} pins={pinDataMap} loginUrl={LOGIN_URL} />
        ) : (
          <PrintSummary
            students={filteredStudents}
            pins={pinDataMap}
            className={selectedClass?.name ?? ""}
          />
        )}
      </div>
    </>
  )
}

export default PrintCredentialsDialog
