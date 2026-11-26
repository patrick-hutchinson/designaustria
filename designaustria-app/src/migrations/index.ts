import * as migration_20261118_123023_initial from './20261118_123023_initial';
import * as migration_20261119_113909_members_organizations from './20261119_113909_members_organizations';
import * as migration_20261119_122723_phone_type_fax from './20261119_122723_phone_type_fax';
import * as migration_20261119_125445_legacy_password_retired from './20261119_125445_legacy_password_retired';
import * as migration_20261119_150122_media_image_sizes from './20261119_150122_media_image_sizes';
import * as migration_20261119_151633_events_media_richtext from './20261119_151633_events_media_richtext';
import * as migration_20261123_102503_media_and_mux_video from './20261123_102503_media_and_mux_video';
import * as migration_20261123_112351_mux_video_playback_mode from './20261123_112351_mux_video_playback_mode';
import * as migration_20261126_123053_events_rebuild from './20261126_123053_events_rebuild';

export const migrations = [
  {
    up: migration_20261118_123023_initial.up,
    down: migration_20261118_123023_initial.down,
    name: '20261118_123023_initial',
  },
  {
    up: migration_20261119_113909_members_organizations.up,
    down: migration_20261119_113909_members_organizations.down,
    name: '20261119_113909_members_organizations',
  },
  {
    up: migration_20261119_122723_phone_type_fax.up,
    down: migration_20261119_122723_phone_type_fax.down,
    name: '20261119_122723_phone_type_fax',
  },
  {
    up: migration_20261119_125445_legacy_password_retired.up,
    down: migration_20261119_125445_legacy_password_retired.down,
    name: '20261119_125445_legacy_password_retired',
  },
  {
    up: migration_20261119_150122_media_image_sizes.up,
    down: migration_20261119_150122_media_image_sizes.down,
    name: '20261119_150122_media_image_sizes',
  },
  {
    up: migration_20261119_151633_events_media_richtext.up,
    down: migration_20261119_151633_events_media_richtext.down,
    name: '20261119_151633_events_media_richtext',
  },
  {
    up: migration_20261123_102503_media_and_mux_video.up,
    down: migration_20261123_102503_media_and_mux_video.down,
    name: '20261123_102503_media_and_mux_video',
  },
  {
    up: migration_20261123_112351_mux_video_playback_mode.up,
    down: migration_20261123_112351_mux_video_playback_mode.down,
    name: '20261123_112351_mux_video_playback_mode',
  },
  {
    up: migration_20261126_123053_events_rebuild.up,
    down: migration_20261126_123053_events_rebuild.down,
    name: '20261126_123053_events_rebuild'
  },
];
