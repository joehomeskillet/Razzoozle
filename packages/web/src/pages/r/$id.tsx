import SharePage from "@razzoozle/web/features/results/SharePage"
import { createFileRoute, useParams } from "@tanstack/react-router"

const SharePageRoute = () => {
  const { id } = useParams({ from: "/r/$id" })

  return <SharePage id={id} />
}

export const Route = createFileRoute("/r/$id")({
  component: SharePageRoute,
})
