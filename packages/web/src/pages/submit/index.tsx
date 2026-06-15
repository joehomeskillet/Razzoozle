import SubmitPage from "@razzoozle/web/features/submission/SubmitPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/submit/")({
  component: SubmitPage,
})
