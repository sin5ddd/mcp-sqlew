/**
 * db:import CLI command - JSON data import for multi-project migration
 * Complements db:export (JSON export) and db:dump (SQL export)
 */

import knex from 'knex';
import * as fs from 'fs';
import * as path from 'path';
import knexConfig from '../knexfile.js';
import { importJsonData } from '../utils/importer/import.js';
import { loadConfigFile } from '../config/loader.js';
import type { JsonImportOptions } from '../types.js';

interface DbImportArgs {
  source: string;
  'project-name'?: string;
  'skip-if-exists'?: boolean;
  'dry-run'?: boolean;
  'db-path'?: string;
  config?: string;
  help?: boolean;
}

/**
 * Show help message for db:import command
 */
export function showDbImportHelp(): void {
  console.log(`
sqlew db:import - Import project data from JSON export

USAGE:
  npx sqlew db:import --source=<file> [options]

OPTIONS:
  --source <file>          JSON export file path (required)
  --project-name <name>    Target project name (default: use name from JSON)
  --skip-if-exists         Skip import if project exists (default: true)
  --dry-run                Validate only, don't import (default: false)
  --db-path <path>         SQLite database file path (overrides config file)
  --config <path>          Config file path (default: auto-detect .sqlew/config.toml)
  --help                   Show this help message

CONFIG FILE:
  The command automatically loads database settings from config.toml.
  Priority: CLI args > config file > environment variables > defaults

EXAMPLES:
  # Import from JSON export
  npx sqlew db:import --source=visualizer-data.json

  # Import with custom project name
  npx sqlew db:import --source=data.json --project-name=visualizer-v2

  # Dry run validation
  npx sqlew db:import --source=data.json --dry-run

  # Import to specific database
  npx sqlew db:import --source=data.json --db-path=.sqlew/target.db

IMPORT BEHAVIOR:
  - Always creates new IDs (no ID preservation from source)
  - Skips import if project name already exists (prevents conflicts)
  - Uses topological sort for task dependencies
  - Wraps entire import in transaction (atomic all-or-nothing)
  - Smart merge for project-scoped tables (files, tags, scopes)

WORKFLOW:
  1. Export data from source database:
     npx sqlew db:export --project=myproject --output=data.json

  2. Copy JSON file to target project directory

  3. Import data into target database:
     npx sqlew db:import --source=data.json

SEE ALSO:
  npx sqlew db:export --help    # Export project data to JSON
  npx sqlew db:dump --help      # SQL export with schema (for database migration)
`);
}

/**
 * Parse command-line arguments for db:import
 */
export function parseDbImportArgs(args: string[]): DbImportArgs {
  const parsed: Partial<DbImportArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      // Handle both --key=value and --key value formats
      let key: string;
      let value: string | undefined;

      if (arg.includes('=')) {
        // --key=value format
        const [k, ...v] = arg.slice(2).split('=');
        key = k;
        value = v.join('='); // Rejoin in case value contains '='
      } else {
        // --key value format
        key = arg.slice(2);
        value = args[i + 1];
      }

      // Handle boolean flags
      if (key === 'help') {
        parsed.help = true;
      } else if (key === 'skip-if-exists') {
        parsed['skip-if-exists'] = true;
      } else if (key === 'dry-run') {
        parsed['dry-run'] = true;
      } else if (value && !value.startsWith('--')) {
        // Handle value arguments
        if (key === 'db-path') {
          parsed['db-path'] = value;
        } else if (key === 'config') {
          parsed.config = value;
        } else if (key === 'project-name') {
          parsed['project-name'] = value;
        } else {
          (parsed as any)[key] = value;
        }
        // Only skip next arg if we used --key value format (not --key=value)
        if (!arg.includes('=')) {
          i++;
        }
      }
    }
  }

  return parsed as DbImportArgs;
}

/**
 * Validate db:import arguments
 */
function validateArgs(args: DbImportArgs): string | null {
  if (!args.source) {
    return 'Error: --source is required (path to JSON export file)';
  }

  if (!fs.existsSync(args.source)) {
    return `Error: Source file not found: ${args.source}`;
  }

  return null;
}

/**
 * Execute db:import command
 */
export async function executeDbImport(args: DbImportArgs): Promise<void> {
  // Show help if requested
  if (args.help) {
    showDbImportHelp();
    return;
  }

  // Validate arguments
  const validationError = validateArgs(args);
  if (validationError) {
    console.error(validationError);
    console.error('Run "npx sqlew db:import --help" for usage information.');
    process.exit(1);
  }

  // Load config file
  console.error(`Loading config file...`);
  const fileConfig = loadConfigFile(process.cwd(), args.config);
  if (fileConfig.database) {
    console.error(`Config loaded: database.type = ${fileConfig.database.type || 'sqlite'}`);
    if (fileConfig.database.path) {
      console.error(`Config loaded: database.path = ${fileConfig.database.path}`);
    }
  }

  // Determine target database
  const configDbType = fileConfig.database?.type || 'sqlite';
  const targetDb = configDbType === 'postgres' ? 'postgresql' : configDbType;

  try {
    console.error(`Reading from ${targetDb.toUpperCase()} database...`);

    // Create Knex instance
    let db: ReturnType<typeof knex>;

    if (targetDb === 'sqlite') {
      const dbPath = args['db-path'] || fileConfig.database?.path || process.env.SQLEW_DB_PATH || '.sqlew/sqlew.db';
      const resolvedDbPath = path.resolve(process.cwd(), dbPath);

      const config = { ...knexConfig.development };
      config.connection = { filename: resolvedDbPath };
      db = knex(config);
      console.error(`Connected to SQLite: ${resolvedDbPath}`);

    } else if (targetDb === 'mysql') {
      const config = { ...knexConfig.mysql };
      if (fileConfig.database?.connection) {
        config.connection = {
          host: fileConfig.database.connection.host || '127.0.0.1',
          port: fileConfig.database.connection.port || 3306,
          user: fileConfig.database.auth?.user || 'root',
          password: fileConfig.database.auth?.password || '',
          database: fileConfig.database.connection.database || 'mcp_context',
          charset: 'utf8mb4',
        };
      }
      db = knex(config);
      console.error(`Connected to MySQL`);

    } else if (targetDb === 'postgresql') {
      const config = { ...knexConfig.postgresql };
      if (fileConfig.database?.connection) {
        config.connection = {
          host: fileConfig.database.connection.host || 'localhost',
          port: fileConfig.database.connection.port || 5432,
          user: fileConfig.database.auth?.user || 'postgres',
          password: fileConfig.database.auth?.password || '',
          database: fileConfig.database.connection.database || 'mcp_context',
        };
      }
      db = knex(config);
      console.error(`Connected to PostgreSQL`);

    } else {
      console.error(`Error: Unsupported target database: ${targetDb}`);
      process.exit(1);
    }

    try {
      // Read JSON file
      console.error(`\nReading JSON export: ${args.source}`);
      const jsonContent = fs.readFileSync(args.source, 'utf-8');
      const jsonData = JSON.parse(jsonContent);

      console.error(`  ✓ JSON parsed (version: ${jsonData.metadata?.sqlew_version || jsonData.version})`);

      // Prepare import options
      const options: JsonImportOptions = {
        targetProjectName: args['project-name'],
        skipIfExists: args['skip-if-exists'] !== false,
        dryRun: args['dry-run'] || false
      };

      // Perform import
      const result = await importJsonData(db, jsonData, options);

      // Report results
      if (result.skipped) {
        console.error(`\n⚠️  Import skipped: ${result.skip_reason}`);
        console.error(`   Project: ${result.project_name}`);
        process.exit(0);
      }

      if (result.success) {
        console.error(`\n✅ Import successful!`);
        console.error(`   Project: ${result.project_name} (ID: ${result.project_id})`);
        if (result.stats) {
          console.error(`   Tasks: ${result.stats.transaction_tables.tasks_created}`);
          console.error(`   Decisions: ${result.stats.transaction_tables.decisions_created}`);
          console.error(`   Files: ${result.stats.master_tables.files_created} created, ${result.stats.master_tables.files_reused} reused`);
        }
      } else {
        console.error(`\n❌ Import failed: ${result.error}`);
        process.exit(1);
      }

    } finally {
      await db.destroy();
    }
  } catch (error) {
    console.error('Error during import:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Main entry point for db:import command
 */
export async function dbImportCommand(args: string[]): Promise<void> {
  const parsedArgs = parseDbImportArgs(args);
  await executeDbImport(parsedArgs);
}
