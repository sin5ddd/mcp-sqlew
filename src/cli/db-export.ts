/**
 * db:export CLI command - JSON data-only export for append-import
 * Complementary to db:dump (SQL export with schema)
 */

import knex from 'knex';
import * as fs from 'fs';
import * as path from 'path';
import knexConfig from '../knexfile.js';
import { generateJsonExport } from '../utils/exporter/export.js';
import { loadConfigFile } from '../config/loader.js';

interface DbExportArgs {
  project?: string;
  output?: string;
  'db-path'?: string;
  config?: string;
  help?: boolean;
}

/**
 * Show help message for db:export command
 */
export function showDbExportHelp(): void {
  console.log(`
sqlew db:export - Export project data to JSON format

USAGE:
  npx sqlew db:export [options]

OPTIONS:
  --project <name>         Export specific project by name (required for multi-project databases)
                           If not specified, exports all projects
  --output <file>          Output file path (default: stdout)
  --db-path <path>         SQLite database file path (overrides config file)
  --config <path>          Config file path (default: auto-detect .sqlew/config.toml or config.toml)
  --help                   Show this help message

CONFIG FILE:
  The command automatically loads database settings from config.toml.
  Priority: CLI args > config file > environment variables > defaults

EXAMPLES:
  # Export specific project to file
  npx sqlew db:export --project=visualizer --output=visualizer-data.json

  # Export all projects
  npx sqlew db:export --output=full-backup.json

  # Export to stdout (pipe to file or another command)
  npx sqlew db:export --project=myproject

  # Export with explicit database path
  npx sqlew db:export --project=myproject --db-path=.sqlew/sqlew.db --output=data.json

EXPORT FORMAT:
  The exported JSON contains:
  - Project metadata
  - Master tables (agents, files, tags, etc.) - only entries used by project
  - Transaction tables (decisions, tasks, constraints, etc.) - filtered by project_id
  - Statistics (decision count, task count, etc.)

IMPORT WORKFLOW:
  1. Export data from source database:
     npx sqlew db:export --project=visualizer --output=data.json

  2. Copy JSON file to target project directory

  3. Import data into target database:
     npx sqlew db:import --source=data.json --project-name=visualizer-v2

SEE ALSO:
  npx sqlew db:dump --help    # SQL export with schema (for full database migration)
  npx sqlew db:import --help  # Import JSON data (append to existing database)
`);
}

/**
 * Parse command-line arguments for db:export
 */
export function parseDbExportArgs(args: string[]): DbExportArgs {
  const parsed: Partial<DbExportArgs> = {};

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

      if (key === 'help') {
        parsed.help = true;
      } else if (value && !value.startsWith('--')) {
        if (key === 'db-path') {
          parsed['db-path'] = value;
        } else if (key === 'config') {
          parsed.config = value;
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

  return parsed as DbExportArgs;
}

/**
 * Validate db:export arguments
 */
function validateArgs(args: DbExportArgs): string | null {
  // No required arguments - project name is optional
  // If not specified, exports all projects
  return null;
}

/**
 * Execute db:export command
 */
export async function executeDbExport(args: DbExportArgs): Promise<void> {
  // Show help if requested
  if (args.help) {
    showDbExportHelp();
    return;
  }

  // Validate arguments
  const validationError = validateArgs(args);
  if (validationError) {
    console.error(validationError);
    console.error('Run "npx sqlew db:export --help" for usage information.');
    process.exit(1);
  }

  const projectName = args.project;
  const output = args.output;

  // Load config file - prioritize: explicit --config > default locations
  console.error(`Loading config file...`);
  const fileConfig = loadConfigFile(process.cwd(), args.config);
  if (fileConfig.database) {
    console.error(`Config loaded: database.type = ${fileConfig.database.type || 'sqlite'}`);
    if (fileConfig.database.path) {
      console.error(`Config loaded: database.path = ${fileConfig.database.path}`);
    }
    if (fileConfig.database.connection) {
      console.error(`Config loaded: database.connection configured`);
    }
  }

  // Determine source database - normalize 'postgres' to 'postgresql'
  const configDbType = fileConfig.database?.type || 'sqlite';
  const sourceDb = configDbType === 'postgres' ? 'postgresql' : configDbType;

  try {
    console.error(`Reading from ${sourceDb.toUpperCase()} database...`);
    if (projectName) {
      console.error(`Exporting project: ${projectName}`);
    } else {
      console.error(`Exporting all projects`);
    }

    // Create Knex instance based on source database
    let db: ReturnType<typeof knex>;

    if (sourceDb === 'sqlite') {
      // SQLite source - prioritize: CLI arg > config file (default) > env var > hardcoded default
      const dbPath = args['db-path'] || fileConfig.database?.path || process.env.SQLEW_DB_PATH || '.sqlew/sqlew.db';
      const resolvedDbPath = path.resolve(process.cwd(), dbPath);

      // Check if database exists
      if (!fs.existsSync(resolvedDbPath)) {
        console.error(`Error: SQLite database not found at ${resolvedDbPath}`);
        process.exit(1);
      }

      const config = { ...knexConfig.development };
      config.connection = { filename: resolvedDbPath };
      db = knex(config);
      console.error(`Connected to SQLite: ${resolvedDbPath}`);

    } else if (sourceDb === 'mysql') {
      // MySQL source - use config file (default) or environment variables
      const config = { ...knexConfig.mysql };
      if (fileConfig.database?.connection) {
        // Override with config file settings
        config.connection = {
          host: fileConfig.database.connection.host || '127.0.0.1',
          port: fileConfig.database.connection.port || 3306,
          user: fileConfig.database.auth?.user || 'root',
          password: fileConfig.database.auth?.password || '',
          database: fileConfig.database.connection.database || 'mcp_context',
          charset: 'utf8mb4',
        };
        console.error(`Using MySQL connection from config file`);
      }
      db = knex(config);
      const conn = config.connection as any;
      console.error(`Connected to MySQL: ${conn.host}:${conn.port}/${conn.database}`);

    } else if (sourceDb === 'postgresql') {
      // PostgreSQL source - use config file (default) or environment variables
      const config = { ...knexConfig.postgresql };
      if (fileConfig.database?.connection) {
        // Override with config file settings
        config.connection = {
          host: fileConfig.database.connection.host || 'localhost',
          port: fileConfig.database.connection.port || 5432,
          user: fileConfig.database.auth?.user || 'postgres',
          password: fileConfig.database.auth?.password || '',
          database: fileConfig.database.connection.database || 'mcp_context',
        };
        console.error(`Using PostgreSQL connection from config file`);
      }
      db = knex(config);
      const conn = config.connection as any;
      console.error(`Connected to PostgreSQL: ${conn.host}:${conn.port}/${conn.database}`);

    } else {
      console.error(`Error: Unsupported source database: ${sourceDb}`);
      process.exit(1);
    }

    try {
      // Generate JSON export
      const json = await generateJsonExport(db, {
        projectName,
      });

      // Output to file or stdout
      if (output) {
        fs.writeFileSync(output, json, 'utf-8');
        console.error(`✓ JSON export written to: ${output}`);
        console.error(`\nNext steps:`);
        console.error(`  1. Copy file to target project directory`);
        console.error(`  2. Import data: npx sqlew db:import --source=${output}`);
      } else {
        // Output to stdout (user can pipe to file)
        console.log(json);
      }
    } finally {
      await db.destroy();
    }
  } catch (error) {
    console.error('Error generating JSON export:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Main entry point for db:export command
 */
export async function dbExportCommand(args: string[]): Promise<void> {
  const parsedArgs = parseDbExportArgs(args);
  await executeDbExport(parsedArgs);
}
