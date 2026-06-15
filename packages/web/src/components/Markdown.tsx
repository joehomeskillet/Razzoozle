import type { AnchorHTMLAttributes, ReactNode } from "react"
import { Fragment } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { twMerge } from "tailwind-merge"

/**
 * Restricted INLINE markdown renderer for question/answer text.
 *
 * Renders a small, safe subset of markdown — strong, em, del, a, code, br —
 * and DISALLOWS every block-level construct (headings, images, lists,
 * blockquotes, rules, code fences, tables). The root paragraph is mapped to a
 * Fragment so no block margins are introduced: the formatted text renders
 * inline within the surrounding heading/button typography.
 *
 * Links open in a new tab and stopPropagation so a link inside an answer
 * button doesn't trigger the button's onClick.
 */
const ALLOWED_ELEMENTS = ["strong", "em", "del", "a", "code", "br", "p"]

const InlineLink = ({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    {...props}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </a>
)

interface Props {
  children: string
  className?: string
}

const Markdown = ({ children, className }: Props) => {
  return (
    <span className={twMerge(className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{
          // Render the root paragraph inline — no block-level margins.
          p: ({ children }: { children?: ReactNode }) => (
            <Fragment>{children}</Fragment>
          ),
          a: InlineLink,
        }}
      >
        {children}
      </ReactMarkdown>
    </span>
  )
}

export default Markdown
