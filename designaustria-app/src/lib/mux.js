// URLs for a video from the `mux-video` collection. Mux builds them from the playback ID.

/** The MP4 that Mux makes on upload (static_renditions in payload.config.ts). */
export const DEFAULT_RENDITION = 'highest'

/** @param {import('@/payload-types').MuxVideo | null | undefined} video */
export function getPlaybackId(video) {
  return video?.playbackOptions?.[0]?.playbackId ?? null
}

/**
 * Plain MP4 file, for short muted loops in a <video> tag.
 * Takes a few seconds to a minute longer than the stream to be ready after upload.
 */
export function getVideoRenditionUrl(video, rendition = DEFAULT_RENDITION) {
  const playbackId = getPlaybackId(video)
  if (!playbackId) return null

  const file = rendition.endsWith('.mp4') || rendition.endsWith('.m4a') ? rendition : `${rendition}.mp4`
  return `https://stream.mux.com/${playbackId}/${file}`
}

/**
 * Still image from the video. Uses the poster time set in the admin (`posterTimestamp`),
 * otherwise Mux's default (the middle of the video).
 */
export function getPosterUrl(video, width = 1200) {
  const playbackId = getPlaybackId(video)
  if (!playbackId) return null

  const params = new URLSearchParams({ width: String(width) })
  if (video.posterTimestamp != null) params.set('time', String(video.posterTimestamp))
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?${params}`
}

/** "16:9" → "16 / 9", for CSS aspect-ratio, so the page doesn't jump while loading. */
export function getAspectRatio(video) {
  return video?.aspectRatio ? video.aspectRatio.replace(':', ' / ') : undefined
}
