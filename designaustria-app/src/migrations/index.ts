import * as migration_20261118_123023_initial from './20261118_123023_initial';
import * as migration_20261119_113909_members_organizations from './20261119_113909_members_organizations';
import * as migration_20261119_122723_phone_type_fax from './20261119_122723_phone_type_fax';

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
    name: '20261119_122723_phone_type_fax'
  },
];
