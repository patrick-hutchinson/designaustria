import * as migration_20261118_123023_initial from './20261118_123023_initial';

export const migrations = [
  {
    up: migration_20261118_123023_initial.up,
    down: migration_20261118_123023_initial.down,
    name: '20261118_123023_initial'
  },
];
