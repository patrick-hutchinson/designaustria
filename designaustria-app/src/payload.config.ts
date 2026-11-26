import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { muxVideoPlugin } from '@oversightstudio/mux-video'
import { muxVideoFields } from './plugins/muxVideoFields'
import { isStaffUser } from './access/roles'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { Members } from './collections/Members'
import { Organizations } from './collections/Organizations'
import { OrganizationMembers } from './collections/OrganizationMembers'
import { Categories } from './collections/Categories'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Members, Organizations, OrganizationMembers, Categories, Media, Events],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  localization: {
    locales: [
      { label: 'Deutsch', code: 'de' },
      { label: 'English', code: 'en' },
    ],
    defaultLocale: 'de',
    fallback: true, // if English is empty, show the German text
  },
  plugins: [
    vercelBlobStorage({
      enabled: true,
      collections: {
        // serve files straight from Blob's CDN, not through /api/media/file/…
        media: { disablePayloadAccessControl: true },
      },
      token: process.env.BLOB_READ_WRITE_TOKEN,
      clientUploads: true, // browser → Blob directly, avoids Vercel's upload limit
      // Without a token the plugin is disabled, and would also leave out its `_objectKey` field on media. Then the schema
      // depends on the environment: a dev push or `migrate:create` without the token drops the column the migrations have.
      alwaysInsertFields: true,
    }),
    muxVideoPlugin({
      enabled: true,
      initSettings: {
        tokenId: process.env.MUX_TOKEN_ID || '',
        tokenSecret: process.env.MUX_TOKEN_SECRET || '',
        webhookSecret: process.env.MUX_WEBHOOK_SIGNING_SECRET || '',
      },
      uploadSettings: {
        cors_origin: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
        new_asset_settings: {
          // Mux also makes a plain MP4 of every upload, for the loop mode of <Video>:
          // https://stream.mux.com/<playbackId>/highest.mp4 (see src/lib/mux.js)
          static_renditions: [{ resolution: 'highest' }],
        },
      },
      access: (req) => isStaffUser(req.user), // only staff may upload videos
    }),
    muxVideoFields, // our extra fields on the Videos collection (playbackMode)
  ],
})
