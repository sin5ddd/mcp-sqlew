import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = {
    development: {
        client: 'better-sqlite3',
        connection: {
            filename: path.join(__dirname, '.sqlew/tmp/test-knex.db'),
        },
        useNullAsDefault: true,
        migrations: {
            directory: path.join(__dirname, 'src/migrations/knex'),
            extension: 'ts',
            tableName: 'knex_migrations',
            loadExtensions: ['.ts'],
        },
        seeds: {
            directory: path.join(__dirname, 'src/seeds'),
            extension: 'ts',
            loadExtensions: ['.ts'],
        },
        // Enable better-sqlite3 pragmas for performance
        pool: {
            afterCreate: (conn, cb) => {
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
            directory: path.join(__dirname, 'src/migrations/knex'),
            extension: 'ts',
        },
        seeds: {
            directory: path.join(__dirname, 'src/seeds'),
            extension: 'ts',
        },
    },
    production: {
        client: 'better-sqlite3',
        connection: {
            filename: path.join(__dirname, '.claude/docs/sqlew.db'),
        },
        useNullAsDefault: true,
        migrations: {
            directory: path.join(__dirname, 'src/migrations/knex'),
            extension: 'ts',
        },
        seeds: {
            directory: path.join(__dirname, 'src/seeds'),
            extension: 'ts',
        },
        pool: {
            afterCreate: (conn, cb) => {
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
//# sourceMappingURL=knexfile.js.map