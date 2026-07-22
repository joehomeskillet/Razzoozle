import { useState } from "react"
import { Printer } from "lucide-react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"
import PrintCredentialsDialog from "./PrintCredentialsDialog"

/**
 * PrintCredentialsTrigger — standalone toolbar button + dialog for credential printing.
 * Use in ConfigSchueler ActionFooter after F2 merge.
 *
 * Example (in ConfigSchueler):
 * <PrintCredentialsTrigger />
 */
const PrintCredentialsTrigger = () => {
  const { t } = useTranslation()
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        className="rounded-[var(--radius-theme)]"
        onClick={() => setIsPrintDialogOpen(true)}
        data-testid="print-credentials-button"
      >
        <Printer className="size-5" aria-hidden strokeWidth={2.5} />
        <span>{t("common:print")}</span>
      </Button>

      <PrintCredentialsDialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen} />
    </>
  )
}

export default PrintCredentialsTrigger
