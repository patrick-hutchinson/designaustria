// One place for the site's image system.
// Used by the Media collection (which files Payload generates on upload)
// and by the Media component (which files the browser may choose from).

// Image widths Payload generates on upload. Width only = no cropping,
// the height follows the image's own aspect ratio. Payload never upscales,
// so sizes larger than the original are skipped.
// After changing these: create a migration, and re-upload old images to get the new sizes.
export const imageSizes = [
  { name: 'sm', width: 320 },
  { name: 'md', width: 640 },
  { name: 'lg', width: 1024 },
  { name: 'xl', width: 1920 },
] as const

// Screen widths where the layout changes. Keep in sync with your SCSS breakpoints.
export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const

// How wide an image is displayed, per layout. The browser reads this BEFORE
// the CSS is applied and picks the smallest file that is still sharp
// (taking screen density into account: 2x screens need twice the pixels).
// Write them like the CSS: the first matching media query wins.
export const sizesPresets = {
  full: '100vw', // edge to edge on every screen
  half: `(min-width: ${breakpoints.tablet}px) 50vw, 100vw`,
  third: `(min-width: ${breakpoints.desktop}px) 33vw, (min-width: ${breakpoints.tablet}px) 50vw, 100vw`,
} as const

export type SizesPreset = keyof typeof sizesPresets
