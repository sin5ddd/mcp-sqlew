/**
 * Centralized Testing Configuration
 *
 * Provides consistent database credentials and Docker container names
 * for all integration tests across the project.
 *
 * Usage:
 * ```typescript
 * import { getTestConfig, DatabaseType } from './testing-config.js';
 *
 * const config = getTestConfig('postgresql');
 * const knexInstance = knex(config);
 * ```
 */

import { Knex } from 'knex';

/**
 * Supported database types for testing
 */
export type DatabaseType = 'sqlite' | 'mysql' | 'mariadb' | 'postgresql';

/**
 * Docker container configuration
 */
export interface DockerContainerConfig {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Database configurations for testing environments
 */
export const TEST_CONFIGS: Record<DatabaseType, Knex.Config | DockerContainerConfig> = {
  sqlite: {
    client: 'better-sqlite3',
    connection: { filename: '.sqlew/sqlew.db' },
    useNullAsDefault: true,
  },

  mysql: {
    name: 'mcp-sqlew-mysql-test',
    host: 'localhost',
    port: 3307,
    user: 'mcp_user',
    password: 'mcp_pass',
    database: 'mcp_test',
  },

  mariadb: {
    name: 'mcp-sqlew-mariadb-test',
    host: 'localhost',
    port: 3308,
    user: 'mcp_user',
    password: 'mcp_pass',
    database: 'mcp_test',
  },

  postgresql: {
    name: 'mcp-sqlew-postgres-test',
    host: 'localhost',
    port: 15432,
    user: 'mcp_user',
    password: 'mcp_pass',
    database: 'mcp_test',
  },
};

/**
 * Get Knex configuration for the specified database type
 *
 * @param dbType - Database type (sqlite, mysql, mariadb, postgresql)
 * @returns Knex configuration object
 *
 * @example
 * ```typescript
 * const config = getTestConfig('postgresql');
 * const db = knex(config);
 * ```
 */
export function getTestConfig(dbType: DatabaseType): Knex.Config {
  const config = TEST_CONFIGS[dbType];

  if (dbType === 'sqlite') {
    return config as Knex.Config;
  }

  // Convert Docker config to Knex config for MySQL/MariaDB/PostgreSQL
  const dockerConfig = config as DockerContainerConfig;

  let client: string;
  switch (dbType) {
    case 'mysql':
    case 'mariadb':
      client = 'mysql2';
      break;
    case 'postgresql':
      client = 'pg';
      break;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }

  return {
    client,
    connection: {
      host: dockerConfig.host,
      port: dockerConfig.port,
      user: dockerConfig.user,
      password: dockerConfig.password,
      database: dockerConfig.database,
    },
  };
}

/**
 * Get Docker container configuration for the specified database type
 *
 * @param dbType - Database type (mysql, mariadb, postgresql)
 * @returns Docker container configuration
 * @throws Error if dbType is 'sqlite' (SQLite doesn't use Docker)
 *
 * @example
 * ```typescript
 * const docker = getDockerConfig('postgresql');
 * execSync(`docker exec ${docker.name} psql -U ${docker.user} ...`);
 * ```
 */
export function getDockerConfig(dbType: Exclude<DatabaseType, 'sqlite'>): DockerContainerConfig {
  // Type system ensures dbType is never 'sqlite', no runtime check needed
  return TEST_CONFIGS[dbType] as DockerContainerConfig;
}

/**
 * Get all Docker-based database types (excludes SQLite)
 *
 * @returns Array of database types that use Docker
 */
export function getDockerDatabaseTypes(): Exclude<DatabaseType, 'sqlite'>[] {
  return ['mysql', 'mariadb', 'postgresql'];
}

/**
 * Get connection string for psql/mysql/mariadb CLI commands
 *
 * @param dbType - Database type
 * @returns Connection string for CLI tools
 *
 * @example
 * ```typescript
 * const connStr = getConnectionString('postgresql');
 * // Returns: "psql -h localhost -p 5432 -U mcp_user -d mcp_test"
 * ```
 */
export function getConnectionString(dbType: Exclude<DatabaseType, 'sqlite'>): string {
  const docker = getDockerConfig(dbType);

  switch (dbType) {
    case 'postgresql':
      return `psql -h ${docker.host} -p ${docker.port} -U ${docker.user} -d ${docker.database}`;
    case 'mysql':
    case 'mariadb':
      return `mysql -h ${docker.host} -P ${docker.port} -u ${docker.user} -p${docker.password} ${docker.database}`;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

/**
 * Get Docker exec command prefix for running commands inside containers
 *
 * @param dbType - Database type
 * @returns Docker exec command prefix
 *
 * @example
 * ```typescript
 * const prefix = getDockerExecPrefix('postgresql');
 * execSync(`${prefix} psql -U mcp_user -d mcp_test -c "SELECT 1"`);
 * ```
 */
export function getDockerExecPrefix(dbType: Exclude<DatabaseType, 'sqlite'>): string {
  const docker = getDockerConfig(dbType);
  return `docker exec ${docker.name}`;
}

/**
 * Validate that a Docker container is running
 *
 * @param dbType - Database type to check
 * @returns true if container is running, false otherwise
 */
export function isDockerContainerRunning(dbType: Exclude<DatabaseType, 'sqlite'>): boolean {
  const docker = getDockerConfig(dbType);
  try {
    const { execSync } = require('child_process');
    const output = execSync(`docker ps --filter "name=${docker.name}" --format "{{.Names}}"`, {
      encoding: 'utf-8',
    });
    return output.trim() === docker.name;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for a Docker container to be ready
 *
 * @param dbType - Database type to wait for
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 30000)
 * @returns Promise that resolves when container is ready
 */
export async function waitForDockerContainer(
  dbType: Exclude<DatabaseType, 'sqlite'>,
  maxWaitMs = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (isDockerContainerRunning(dbType)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Docker container for ${dbType} did not start within ${maxWaitMs}ms`);
}
