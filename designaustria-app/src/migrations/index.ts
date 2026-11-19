import * as migration_20261118_123023_initial from './20261118_123023_initial';
import * as migration_20261119_132831_media_image_sizes from './20261119_132831_media_image_sizes';
import * as migration_20261119_132846_events_media_richtext from './20261119_132846_events_media_richtext';

export const migrations = [
  {
    up: migration_20261118_123023_initial.up,
    down: migration_20261118_123023_initial.down,
    name: '20261118_123023_initial',
  },
  {
    up: migration_20261119_132831_media_image_sizes.up,
    down: migration_20261119_132831_media_image_sizes.down,
    name: '20261119_132831_media_image_sizes',
  },
  {
    up: migration_20261119_132846_events_media_richtext.up,
    down: migration_20261119_132846_events_media_richtext.down,
    name: '20261119_132846_events_media_richtext'
  },
];
