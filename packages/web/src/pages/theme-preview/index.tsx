import ThemePreviewWindow from "@razzoozle/web/features/manager/components/configurations/theme-preview/ThemePreviewWindow"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/theme-preview/")({
  component: ThemePreviewWindow,
})
