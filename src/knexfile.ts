// knexfile.ts
import type { Knex } from 'knex';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default database path: .sqlew/sqlew.db in project root
// Can be overridden via config file (.sqlew/config.toml) or CLI args
const DEFAULT_DB_PATH = process.env.SQLEW_DB_PATH || '.sqlew/sqlew.db';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: {
      // Development uses project root relative path
      filename: path.resolve(process.cwd(), DEFAULT_DB_PATH),
    },
    useNullAsDefault: true,
    migrations: {
      directory: [
        path.join(__dirname, 'migrations/knex/bootstrap'),
        path.join(__dirname, 'migrations/knex/upgrades'),
        path.join(__dirname, 'migrations/knex/enhancements'),
      ],
      extension: 'ts',
      tableName: 'knex_migrations',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    // Enable better-sqlite3 pragmas for performance
    pool: {
      afterCreate: (conn: any, cb: any) => {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        conn.pragma('synchronous = NORMAL');
        conn.pragma('busy_timeout = 5000');
        cb(null, conn);
      },
    },
  },

  test: {
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:', // In-memory database for testing
    },
    useNullAsDefault: true,
    migrations: {
      directory: [
        path.join(__dirname, 'migrations/knex/bootstrap'),
        path.join(__dirname, 'migrations/knex/upgrades'),
        path.join(__dirname, 'migrations/knex/enhancements'),
      ],
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  },

  production: {
    client: 'better-sqlite3',
    connection: {
      // Production uses project root relative path
      filename: path.resolve(process.cwd(), DEFAULT_DB_PATH),
    },
    useNullAsDefault: true,
    migrations: {
      directory: [
        path.join(__dirname, 'migrations/knex/bootstrap'),
        path.join(__dirname, 'migrations/knex/upgrades'),
        path.join(__dirname, 'migrations/knex/enhancements'),
      ],
      extension: 'js',
      loadExtensions: ['.js'],
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'js',
      loadExtensions: ['.js'],
    },
    pool: {
      afterCreate: (conn: any, cb: any) => {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        conn.pragma('synchronous = FULL'); // Production: maximum safety
        conn.pragma('busy_timeout = 10000');
        cb(null, conn);
      },
    },
  },
};

export default config;
