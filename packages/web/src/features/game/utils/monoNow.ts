// Monotonic clock for measuring ack latency, immune to wall-clock jumps. Falls
// back to Date.now() so it never throws where the Performance API is
// unavailable. Replicated verbatim from the inline copies in socket-context.tsx
// and Answers.tsx so behavior is identical.
export function monoNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}
