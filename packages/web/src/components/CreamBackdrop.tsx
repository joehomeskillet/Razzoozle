const CreamBackdrop = () => (
  <div aria-hidden className="cream-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <span className="cb-blob cb-blob--a" />
    <span className="cb-blob cb-blob--b" />
    <span className="cb-blob cb-blob--c" />
    <svg className="cb-shape cb-shape--tile" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="8" y="8" width="84" height="84" rx="22" />
    </svg>
    <svg className="cb-shape cb-shape--bolt" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M38 6 L14 36 H30 L26 58 L50 28 H34 Z" />
    </svg>
  </div>
)

export default CreamBackdrop