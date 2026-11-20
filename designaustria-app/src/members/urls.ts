// Links around member login. Safe to import in client components.

/** Payload's login page, coming back to /<locale>/me (and from there to the member page or /admin) after logging in. */
export const loginUrl = (locale: string) =>
  `/admin/login?redirect=${encodeURIComponent(`/${locale}/me`)}`

/** Redirects the logged-in user to their own member page (staff: /admin). */
export const meUrl = (locale: string) => `/${locale}/me`
