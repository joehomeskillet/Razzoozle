import i18n, { type Resource, type ResourceKey } from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

const modules = import.meta.glob("./locales/*/*.json", { eager: true })

const resources = Object.entries(modules).reduce<Resource>(
  (acc, [path, mod]) => {
    const match = /\.\/locales\/(\w+)\/(\w+)\.json$/u.exec(path)

    if (!match) {
      return acc
    }

    const [, lang, ns] = match
    acc[lang] ??= {}
    acc[lang][ns] = (mod as { default: ResourceKey }).default

    return acc
  },
  {},
)

const baseLang = (lng?: string) => (lng ?? "en").split("-")[0]

const syncHtmlLang = (lng?: string) => {
  if (typeof document === "undefined") {
    return
  }
  document.documentElement.lang = baseLang(lng)
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    defaultNS: "common",
    resources,
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
