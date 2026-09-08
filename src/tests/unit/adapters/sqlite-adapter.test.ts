import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SQLiteAdapter } from '../../../adapters/sqlite-adapter.js';
import type { DatabaseConfig } from '../../../config/types.js';

describe('SQLiteAdapter.connect parent directory', () => {
  let adapter: SQLiteAdapter | undefined;
  let tempRoot: string | undefined;

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect();
      adapter = undefined;
    }
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('creates missing parent directories before opening a file database', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sqlew-sqlite-parent-'));
    const dbPath = join(tempRoot, 'nested', 'dir', 'test.db');
    assert.equal(existsSync(join(tempRoot, 'nested')), false);

    const adapterConfig = {
      type: 'sqlite',
      connection: { database: dbPath },
    } as DatabaseConfig; // connect() is given knex filename; constructor only stores config
    adapter = new SQLiteAdapter(adapterConfig);
    await adapter.connect({
      client: 'better-sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
    });

    assert.equal(existsSync(join(tempRoot, 'nested', 'dir')), true);
    assert.equal(existsSync(dbPath), true);
    await adapter.getKnex().raw('SELECT 1 as ok');
  });

  it('does not create directories for :memory: databases', async () => {
    const adapterConfig = {
      type: 'sqlite',
      connection: { database: ':memory:' },
    } as DatabaseConfig; // connect() is given knex filename; constructor only stores config
    adapter = new SQLiteAdapter(adapterConfig);
    await adapter.connect({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await adapter.getKnex().raw('SELECT 1 as ok');
  });
});
