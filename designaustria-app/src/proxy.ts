import { NextResponse, type NextRequest } from 'next/server'

import { defaultLocale, isLocale, type Locale } from './i18n'

// Remembers the language a visitor last used (e.g. via the language switcher).
const LOCALE_COOKIE = 'NEXT_LOCALE'

// Runs before every matched request.
// - URL already has a language (/de/..., /en/...): remember it in a cookie.
// - URL has no language (/events): redirect, choosing the language from
//   1. the cookie, 2. the browser's Accept-Language header, 3. the default.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const [, firstSegment] = pathname.split('/')

  if (isLocale(firstSegment)) {
    const response = NextResponse.next()
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      response.cookies.set(LOCALE_COOKIE, firstSegment, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // one year
        sameSite: 'lax',
      })
    }
    return response
  }

  const locale = getPreferredLocale(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

function getPreferredLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value
  if (fromCookie && isLocale(fromCookie)) return fromCookie

  // Accept-Language looks like: "en-US,en;q=0.9,de;q=0.8"
  const header = request.headers.get('accept-language') ?? ''
  const preferred = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { language: tag.split('-')[0].toLowerCase(), q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
    .find(({ language }) => isLocale(language))

  return preferred && isLocale(preferred.language) ? preferred.language : defaultLocale
}

export const config = {
  // Skip Payload (admin, api), Next.js internals and files with an extension.
  matcher: ['/((?!admin|api|_next|my-route|.*\\..*).*)'],
}
