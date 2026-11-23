import type { Field, Plugin } from 'payload'

/**
 * Our own fields on the Mux plugin's `mux-video` collection ("Videos" in the admin).
 * Listed after muxVideoPlugin() in payload.config.ts, so the collection exists by then.
 */
const fields: Field[] = [
  {
    name: 'playbackMode',
    type: 'radio',
    defaultValue: 'auto',
    options: [
      { label: 'Automatic (decided by where the video is used)', value: 'auto' },
      { label: 'Loop: muted, autoplay, no controls (MP4)', value: 'loop' },
      { label: 'Player: sound and controls (streaming)', value: 'player' },
    ],
    admin: {
      position: 'sidebar',
      description:
        'Overrides how this video plays on the website. Loop suits short clips; Player suits longer videos.',
    },
  },
]

export const muxVideoFields: Plugin = (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) =>
    collection.slug === 'mux-video'
      ? { ...collection, fields: [...collection.fields, ...fields] }
      : collection,
  ),
})
