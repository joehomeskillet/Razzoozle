export const formatDate = (iso: string) => {
  const d = new Date(iso)

  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} - ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
