// `toast` MUST come from the bundle (re-exported there), not from
// "react-hot-toast" directly — a separately-bundled copy has its own
// singleton store and the bundled <Toaster/> never sees the toast.
import { Toaster, toast } from "@razzoozle/web"
import { useEffect } from "react"

export const Success = () => {
  useEffect(() => {
    toast.success("Quiz saved")
  }, [])

  return (
    <div
      style={{
        background: "var(--color-field-cream)",
        padding: 24,
        minHeight: 120,
        position: "relative",
      }}
    >
      <Toaster />
    </div>
  )
}

export const Error = () => {
  useEffect(() => {
    toast.error("Could not connect to game")
  }, [])

  return (
    <div
      style={{
        background: "var(--color-field-cream)",
        padding: 24,
        minHeight: 120,
        position: "relative",
      }}
    >
      <Toaster />
    </div>
  )
}
