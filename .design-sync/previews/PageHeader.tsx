import { Button, PageHeader } from "@razzoozle/web"

export const TitleOnly = () => (
  <div style={{ maxWidth: 640 }}>
    <PageHeader title="Fragenkatalog" />
  </div>
)

export const WithSubtitle = () => (
  <div style={{ maxWidth: 640 }}>
    <PageHeader
      title="Medienbibliothek"
      subtitle="Bilder und Audio für deine Quizfragen verwalten."
    />
  </div>
)

export const WithAction = () => (
  <div style={{ maxWidth: 640 }}>
    <PageHeader
      title="Quizze"
      subtitle="Alle Quizze deiner Schule an einem Ort."
      action={<Button size="sm">Neues Quiz</Button>}
    />
  </div>
)
