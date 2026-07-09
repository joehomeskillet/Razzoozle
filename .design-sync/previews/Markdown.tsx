import { Markdown } from "@razzoozle/web"

export const InlineFormatting = () => (
  <p style={{ maxWidth: 460, fontSize: 18, lineHeight: 1.5 }}>
    <Markdown>
      {"Which **planet** hides a *liquid* ocean under ~~ice~~ its crust? Hint: read about [Europa](https://en.wikipedia.org/wiki/Europa_(moon)) or try `JUICE`."}
    </Markdown>
  </p>
)

export const InsideHeading = () => (
  <h2 style={{ fontSize: 28, fontWeight: 700, maxWidth: 520 }}>
    <Markdown>{"Round 3 — **Final question** for *double* points"}</Markdown>
  </h2>
)

export const InsideAnswerText = () => (
  <span style={{ fontSize: 16 }}>
    <Markdown>{"`H2O` — also known as **water**"}</Markdown>
  </span>
)
