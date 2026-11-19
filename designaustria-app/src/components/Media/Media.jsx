import React from 'react'

import { imageSizes, sizesPresets } from '@/images'

/**
 * Renders an image or a video, depending on the uploaded file's type.
 *
 * For images, it lists every generated width in `srcset`, and tells the browser
 * how wide the image will be displayed via `sizes`. The browser then downloads
 * the smallest file that is still sharp on the current screen.
 *
 * An upload field is either the full document (when Payload "populates" it,
 * the default for find()) or just its ID. We can only render the full document.
 *
 * @param {object} props
 * @param {import('@/payload-types').Media | number | null | undefined} props.media
 * @param {import('@/images').SizesPreset | string} [props.sizes]
 *   How wide the image is displayed: a preset from src/images.ts ('full', 'half', 'third')
 *   or your own sizes string, e.g. '(min-width: 768px) 25vw, 50vw'. Default: 'full'.
 * @param {number} [props.height]
 *   Use instead of `sizes` when the CSS gives the image a fixed height in px
 *   (and `width: auto`): the displayed width is then calculated from the aspect ratio.
 * @param {string} [props.className]
 */
export function Media({ media, sizes = 'full', height, className }) {
  if (!media || typeof media === 'number' || !media.url) return null

  if (media.mimeType?.startsWith('video/')) {
    return (
      <video className={className} src={media.url} controls playsInline preload="metadata">
        {media.alt}
      </video>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- srcset/sizes are built by hand
    <img
      className={className}
      src={media.url}
      srcSet={getSrcSet(media)}
      sizes={getSizes(media, sizes, height)}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading="lazy"
      decoding="async"
    />
  )
}

// "url 320w, url 640w, …": every generated width that exists for this image,
// plus the original. Sizes larger than the original were skipped by Payload.
function getSrcSet(media) {
  const candidates = imageSizes
    .map(({ name }) => media.sizes?.[name])
    .filter((size) => size?.url && size?.width)
    .map((size) => ({ url: size.url, width: size.width }))

  if (media.width) candidates.push({ url: media.url, width: media.width })

  const unique = new Map(candidates.map((c) => [c.width, c]))
  return [...unique.values()]
    .sort((a, b) => a.width - b.width)
    .map((c) => `${c.url} ${c.width}w`)
    .join(', ')
}

function getSizes(media, sizes, height) {
  if (height && media.width && media.height) {
    return `${Math.round((height * media.width) / media.height)}px`
  }
  return sizesPresets[sizes] ?? sizes
}
