import i18n, {
  type BackendModule,
  type ReadCallback,
  type Resource,
  type ResourceKey,
} from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

// Per-locale namespace JSON files. Non-eager: each becomes its own lazy chunk
// so only the active language is pulled into the initial bundle (the rest are
// fetched on demand when the user switches language).
const loaders = import.meta.glob<{ default: ResourceKey }>(
  "./locales/*/*.json",
)

const LOADER_RE = /\.\/locales\/(\w+)\/(\w+)\.json$/u
const SUPPORTED = ["en", "de", "es", "fr", "it", "zh"] as const

const baseLang = (lng?: string) => (lng ?? "en").split("-")[0]

const findLoader = (lang: string, ns: string) =>
  Object.entries(loaders).find(([path]) => {
    const match = LOADER_RE.exec(path)
    return match && match[1] === lang && match[2] === ns
  })?.[1]

// Tiny i18next backend that resolves a single (language, namespace) to its
// lazily-imported JSON chunk. Non-active languages never enter the eager bundle.
const lazyBackend: BackendModule = {
  type: "backend",
  init: () => {},
  read(language: string, namespace: string, callback: ReadCallback) {
    const loader = findLoader(language, namespace)
    if (!loader) {
      callback(new Error(`No locale chunk for ${language}/${namespace}`), false)
      return
    }
    loader().then(
      (mod) => callback(null, mod.default),
      (err) => callback(err as Error, false),
    )
  },
}

const syncHtmlLang = (lng?: string) => {
  if (typeof document === "undefined") {
    return
  }
  document.documentElement.lang = baseLang(lng)
}

// Detect the active language synchronously (same order as i18next's detector)
// so we can eager-load only that locale's namespaces before init — guaranteeing
// the active language is present for the first synchronous `t()` calls.
const detectInitialLang = (): string => {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== "undefined" ? localStorage.getItem("i18nextLng") : null
  } catch {
    stored = null
  }
  const navLang =
    typeof navigator !== "undefined" ? navigator.language : undefined
  const candidate = baseLang(stored ?? navLang ?? "en")
  return (SUPPORTED as readonly string[]).includes(candidate) ? candidate : "en"
}

const initialLang = detectInitialLang()

// Eager-load (await) only the active language's namespaces, then register the
// rest via the lazy backend. `partialBundledLanguages` lets bundled resources
// and the backend coexist.
const initialResources: Resource = { [initialLang]: {} }
await Promise.all(
  Object.entries(loaders).map(async ([path, loader]) => {
    const match = LOADER_RE.exec(path)
    if (!match || match[1] !== initialLang) {
      return
    }
    const mod = await loader()
    initialResources[initialLang][match[2]] = mod.default
  }),
)

await i18n
  .use(lazyBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: initialLang,
    fallbackLng: "en",
    supportedLngs: SUPPORTED as unknown as string[],
    defaultNS: "common",
    ns: Object.keys(initialResources[initialLang]),
    resources: initialResources,
    partialBundledLanguages: true,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })

syncHtmlLang(i18n.resolvedLanguage ?? i18n.language)
i18n.on("languageChanged", (lng) => {
  syncHtmlLang(lng)
})

export default i18n
