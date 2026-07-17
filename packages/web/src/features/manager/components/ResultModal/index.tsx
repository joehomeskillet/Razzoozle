import * as RadixDialog from "@radix-ui/react-dialog"
import type { GameResult } from "@razzoozle/common/types/game"
import ResultModalAnswers from "@razzoozle/web/features/manager/components/ResultModal/ResultModalAnswers"
import ResultModalHeader from "@razzoozle/web/features/manager/components/ResultModal/ResultModalHeader"
import ResultModalStats from "@razzoozle/web/features/manager/components/ResultModal/ResultModalStats"
import ResultModalTable from "@razzoozle/web/features/manager/components/ResultModal/ResultModalTable"
import { ResultModalProvider } from "@razzoozle/web/features/manager/contexts/result-modal-context"

// The dialog title (`result.subject`) is rendered inside ResultModalHeader; this
// shared id wires Radix's `aria-labelledby` to that heading.
export const RESULT_MODAL_TITLE_ID = "result-modal-title"

interface Props {
  result: GameResult
  onClose: () => void
}

// Radix gives us focus-trap, aria-modal, Escape-to-close, return-focus and
// body-scroll-lock for free. We use `react-dialog` (not `react-alert-dialog`)
// because this is a browsable results viewer with prev/next navigation, not an
// urgent confirmation — so it should carry `role="dialog"`, not
// `role="alertdialog"`. Parts used: Root/Portal/Overlay/Content; the Title and
// Close live in ResultModalHeader.
const ResultModal = ({ result, onClose }: Props) => (
  <RadixDialog.Root
    open
    onOpenChange={(next) => {
      if (!next) {
        onClose()
      }
    }}
  >
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-60 bg-black/40" />
      <RadixDialog.Content
        aria-labelledby={RESULT_MODAL_TITLE_ID}
        aria-describedby={undefined}
        className="fixed top-1/2 left-1/2 z-60 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface)] shadow-2xl focus:outline-none"
      >
        <ResultModalProvider result={result} onClose={onClose}>
          <ResultModalHeader />
          <ResultModalAnswers />
          <ResultModalStats />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ResultModalTable />
          </div>
        </ResultModalProvider>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
)

export default ResultModal
