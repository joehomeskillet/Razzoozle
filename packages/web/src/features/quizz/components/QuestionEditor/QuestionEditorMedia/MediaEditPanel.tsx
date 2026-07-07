import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Loader from "@razzoozle/web/components/Loader"
import { Pencil } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

interface MediaEditPanelProps {
  canEditImage: boolean
  editPrompt: string
  setEditPrompt: Dispatch<SetStateAction<string>>
  editing: boolean
  handleEdit: () => void
  handleRemoveMedia: () => void
}

const MediaEditPanel = ({
  canEditImage,
  editPrompt,
  setEditPrompt,
  editing,
  handleEdit,
  handleRemoveMedia,
}: MediaEditPanelProps) => {
  const { t } = useTranslation()

  return (
    <div className="mt-2 flex w-full max-w-xl flex-col items-center gap-3">
      {/*
        img2img edit — only when the current media is an image with a /media
        URL the server can resolve. The base bytes are read server-side from
        disk (the client only sends the relative URL), so no client canvas
        editing happens here.
      */}
      {canEditImage && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <Input
            variant="sm"
            className="w-full"
            placeholder={t("quizz:question.media.editPromptPlaceholder", {
              defaultValue: "Beschreibe die Änderung am Bild",
            })}
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            disabled={editing}
          />
          <Button
            size="sm"
            className="min-h-11"
            onClick={handleEdit}
            disabled={editing || !editPrompt.trim()}
            classNameContent="gap-1.5"
          >
            {editing ? (
              <Loader className="size-5 text-white" />
            ) : (
              <Pencil className="size-5" />
            )}
            <p>
              {editing
                ? t("quizz:question.media.editing", {
                    defaultValue: "Wird bearbeitet",
                  })
                : t("quizz:question.media.editButton", {
                    defaultValue: "Bild per Text ändern",
                  })}
            </p>
          </Button>
        </div>
      )}

      <Button variant="secondary" onClick={handleRemoveMedia}>
        {t("common:delete")}
      </Button>
    </div>
  )
}

export default MediaEditPanel
