// Languages of the website. Keep in sync with `localization` in payload.config.ts.
export const locales = ['de', 'en'] as const
export const defaultLocale = 'de'

export type Locale = (typeof locales)[number]

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

// Builds the canonical URL and hreflang alternates for a page.
// `path` is the part after the language, e.g. '/events' or '' for the home page.
// Use it in a page's generateMetadata: `return { alternates: getAlternates(locale, '/events') }`
// Next.js turns this into <link rel="canonical"> and <link rel="alternate" hreflang="...">.
export function getAlternates(locale: Locale, path: string) {
  const languages: Record<string, string> = {}
  for (const l of locales) languages[l] = `/${l}${path}`
  // x-default: for visitors whose language isn't offered -> URL without language,
  // where the proxy picks a language for them.
  languages['x-default'] = path || '/'

  return { canonical: `/${locale}${path}`, languages }
}
