'use client'

import MuxPlayer from '@mux/mux-player-react'

// Plays a video from the `mux-video` collection (created by the Mux plugin).
// Mux streams it adaptively: the quality follows the viewer's screen and connection.
export function Video({ video, className }) {
  // `video` is only an ID if the query didn't populate it (depth 0)
  if (!video || typeof video !== 'object') return null

  const playback = video.playbackOptions?.[0]
  if (!playback?.playbackId) return null // still processing in Mux

  return (
    <MuxPlayer
      className={className}
      playbackId={playback.playbackId}
      poster={playback.posterUrl}
      metadata={{ video_title: video.title }}
      // reserve the right space before the video loads, so the page doesn't jump
      style={video.aspectRatio ? { aspectRatio: video.aspectRatio.replace(':', ' / ') } : undefined}
    />
  )
}
