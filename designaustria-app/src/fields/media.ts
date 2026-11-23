import type { RelationshipField } from 'payload'

type MediaFieldOptions = {
  name?: string
  label?: string
  /** true = a list of images/videos (gallery), false = exactly one. */
  hasMany?: boolean
  required?: boolean
}

/**
 * One field that holds an image (Media collection) or a video (Mux "Videos" collection).
 *
 * In the admin, the picker first asks "Media" or "Videos", then lets you choose an
 * existing one or create a new one with the "+" button (upload right there, in a drawer).
 *
 * Stored value per item: `{ relationTo: 'media' | 'mux-video', value: <doc or id> }`.
 * Render it with <Media media={…} /> from src/components/Media, which handles both types.
 */
export const mediaField = ({
  name = 'media',
  label,
  hasMany = false,
  required = false,
}: MediaFieldOptions = {}): RelationshipField => ({
  name,
  label,
  type: 'relationship',
  relationTo: ['media', 'mux-video'],
  hasMany,
  required,
  admin: {
    description: hasMany ? 'Images and/or videos, in this order.' : 'An image or a video.',
  },
})
