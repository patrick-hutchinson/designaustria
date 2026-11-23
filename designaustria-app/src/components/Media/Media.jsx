import React from 'react'

import { Video } from '@/components/Video/Video'
import { imageSizes, sizesPresets } from '@/images'

/**
 * Renders whatever a mediaField() holds (src/fields/media.ts):
 * - one item or a list of items (hasMany)
 * - each item an image (`media` collection) or a Mux video (`mux-video` collection)
 *
 * Also accepts a plain Media document, e.g. from an upload field.
 * Items that are only an ID (not populated by Payload) are skipped.
 *
 * @param {object} props
 * @param {any} props.media
 *   `{ relationTo, value }`, an array of those, or a Media document.
 * @param {import('@/images').SizesPreset | string} [props.sizes]
 *   How wide an image is displayed: a preset from src/images.ts ('full', 'half', 'third')
 *   or your own sizes string, e.g. '(min-width: 768px) 25vw, 50vw'. Default: 'full'.
 * @param {number} [props.height]
 *   Use instead of `sizes` when the CSS gives the image a fixed height in px
 *   (and `width: auto`): the displayed width is then calculated from the aspect ratio.
 * @param {'loop' | 'player'} [props.videoMode]
 *   How videos play here, unless the video's own "Playback mode" in the admin says otherwise.
 *   'loop' = muted autoplay MP4, 'player' = streaming with controls. Default: 'player'.
 * @param {string} [props.className]
 */
export function Media({ media, ...props }) {
  if (Array.isArray(media)) {
    return media.map((item, i) => <Media key={getKey(item, i)} media={item} {...props} />)
  }
  if (!media || typeof media !== 'object') return null

  // From a mediaField(): { relationTo: 'media' | 'mux-video', value: <document or ID> }
  if ('relationTo' in media) {
    if (!media.value || typeof media.value !== 'object') return null
    if (media.relationTo === 'mux-video') {
      return <Video video={media.value} mode={props.videoMode} className={props.className} />
    }
    return <Image image={media.value} {...props} />
  }

  return <Image image={media} {...props} />
}

/**
 * An image with every generated width in `srcset`, plus a `sizes` hint, so the browser
 * downloads the smallest file that is still sharp on the current screen.
 */
function Image({ image, sizes = 'full', height, className }) {
  if (!image.url) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element -- srcset/sizes are built by hand
    <img
      className={className}
      src={image.url}
      srcSet={getSrcSet(image)}
      sizes={getSizes(image, sizes, height)}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading="lazy"
      decoding="async"
    />
  )
}

function getKey(item, index) {
  const doc = item?.value ?? item
  return `${item?.relationTo ?? 'media'}-${doc?.id ?? doc ?? index}`
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
