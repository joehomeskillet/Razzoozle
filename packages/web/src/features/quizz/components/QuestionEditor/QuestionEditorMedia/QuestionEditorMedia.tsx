import type { QuestionMediaType } from "@razzoozle/common/types/game"
import { questionMediaValidator } from "@razzoozle/common/validators/quizz"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import MediaPickerModal from "@razzoozle/web/features/quizz/components/MediaPickerModal"
import MediaEditPanel from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMedia/MediaEditPanel"
import MediaEmptyCard from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMedia/MediaEmptyCard"
import { useMediaGeneration } from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorMedia/useMediaGeneration"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuestionEditorMedia = () => {
  const { updateQuestion, currentIndex, currentQuestion, isManager } =
    useQuizzEditor()
  const questionMedia = currentQuestion.media
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  const {
    fileInputRef,
    aiPrompt,
    setAiPrompt,
    generating,
    uploading,
    enhancedPrompt,
    enhancing,
    editPrompt,
    setEditPrompt,
    editing,
    canEditImage,
    handleGenerate,
    handleUploadClick,
    handleFile,
    handleEnhance,
    handleEdit,
  } = useMediaGeneration()

  const handleSelectFromLibrary = (url: string) => {
    updateQuestion(currentIndex, { media: { type: "image", url } })
  }

  const hadnleChangeMediaType = (type: QuestionMediaType) => () => {
    const result = questionMediaValidator.safeParse({
      type,
      url: questionMedia?.url,
    })

    if (!result.success) {
      toast.error(t(result.error.issues[0].message))

      return
    }

    updateQuestion(currentIndex, { media: result.data })
  }

  const handleRemoveMedia = () => {
    if (!questionMedia) {
      return
    }

    updateQuestion(currentIndex, { media: undefined })
  }

  const handleChangeMedia = (e: ChangeEvent<HTMLInputElement>) => {
    updateQuestion(currentIndex, {
      media: { url: e.target.value },
    })
  }

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <QuestionMedia media={currentQuestion.media} alt="Question Media" />

      {/* Hidden, public file input shared by the upload button below. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {!questionMedia?.type && (
        <MediaEmptyCard
          questionMedia={questionMedia}
          isManager={isManager}
          uploading={uploading}
          generating={generating}
          enhancing={enhancing}
          aiPrompt={aiPrompt}
          setAiPrompt={setAiPrompt}
          enhancedPrompt={enhancedPrompt}
          setPickerOpen={setPickerOpen}
          handleChangeMedia={handleChangeMedia}
          hadnleChangeMediaType={hadnleChangeMediaType}
          handleUploadClick={handleUploadClick}
          handleEnhance={handleEnhance}
          handleGenerate={handleGenerate}
        />
      )}

      {questionMedia?.type && (
        <MediaEditPanel
          canEditImage={canEditImage}
          editPrompt={editPrompt}
          setEditPrompt={setEditPrompt}
          editing={editing}
          handleEdit={handleEdit}
          handleRemoveMedia={handleRemoveMedia}
        />
      )}

      {isManager && (
        <MediaPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectFromLibrary}
        />
      )}
    </div>
  )
}

export default QuestionEditorMedia
