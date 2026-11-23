'use client'

import { useEffect, useRef, useState } from 'react'
import MuxPlayer from '@mux/mux-player-react'

import { getAspectRatio, getPlaybackId, getPosterUrl, getVideoRenditionUrl } from '@/lib/mux'

/**
 * Plays a video from the `mux-video` collection in one of two ways:
 * - 'loop':   the MP4 in a plain <video>: muted, autoplay, looping, no controls. For short clips.
 * - 'player': Mux Player streaming (HLS): sound, controls, quality adapts to the connection. For longer videos.
 *
 * Which one: the video's "Playback mode" in the admin wins; if that is "Automatic",
 * the `mode` prop decides, i.e. the component that uses <Video> sets the default.
 *
 * @param {object} props
 * @param {import('@/payload-types').MuxVideo | number | null | undefined} props.video
 * @param {'loop' | 'player'} [props.mode] Default for this place on the site. Default: 'player'.
 * @param {string} [props.className]
 */
export function Video({ video, mode = 'player', className }) {
  // `video` is only an ID if the query didn't populate it (depth 0)
  if (!video || typeof video !== 'object') return null
  if (!getPlaybackId(video)) return null // still processing in Mux

  const resolvedMode = video.playbackMode && video.playbackMode !== 'auto' ? video.playbackMode : mode

  return resolvedMode === 'loop' ? (
    <LoopVideo video={video} className={className} />
  ) : (
    <PlayerVideo video={video} className={className} />
  )
}

function PlayerVideo({ video, className }) {
  return (
    <MuxPlayer
      className={className}
      playbackId={getPlaybackId(video)}
      poster={getPosterUrl(video)}
      metadata={{ video_title: video.title }}
      style={{ aspectRatio: getAspectRatio(video) }}
    />
  )
}

function LoopVideo({ video, className }) {
  const ref = useRef(null)
  // The MP4 can be missing for a short while after upload (or for videos uploaded
  // before static renditions were switched on): then stream it instead.
  const [mp4Failed, setMp4Failed] = useState(false)

  // Only play while on screen: saves bandwidth and battery.
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) element.play()?.catch(() => {})
      else element.pause()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mp4Failed])

  if (mp4Failed) {
    return (
      <MuxPlayer
        ref={ref}
        className={className}
        playbackId={getPlaybackId(video)}
        poster={getPosterUrl(video)}
        muted
        loop
        playsInline
        nohotkeys
        style={{ aspectRatio: getAspectRatio(video), '--controls': 'none' }}
      />
    )
  }

  return (
    <video
      ref={ref}
      className={className}
      src={getVideoRenditionUrl(video)}
      poster={getPosterUrl(video) ?? undefined}
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setMp4Failed(true)}
      style={{ aspectRatio: getAspectRatio(video), objectFit: 'cover' }}
    />
  )
}
