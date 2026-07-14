export interface LabelColor {
  slug: string
  label: string
  bg: string
  text: string
}

export const LABEL_PALETTE: LabelColor[] = [
  { slug: "red", label: "Rot", bg: "bg-[var(--label-red-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "blue", label: "Blau", bg: "bg-[var(--label-blue-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "green", label: "Grün", bg: "bg-[var(--label-green-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "yellow", label: "Gelb", bg: "bg-[var(--label-yellow-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "purple", label: "Violett", bg: "bg-[var(--label-purple-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "pink", label: "Rosa", bg: "bg-[var(--label-pink-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "indigo", label: "Indigo", bg: "bg-[var(--label-indigo-bg)]", text: "text-[var(--answer-text)]" },
  { slug: "gray", label: "Grau", bg: "bg-[var(--label-gray-bg)]", text: "text-[var(--answer-text)]" },
]

export function getLabelColor(slug: string): LabelColor {
  return LABEL_PALETTE.find(c => c.slug === slug) || LABEL_PALETTE[LABEL_PALETTE.length - 1]
}
