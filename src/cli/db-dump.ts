// db-dump.ts - CLI command for dumping database to SQL format

import knex from 'knex';
import * as fs from 'fs';
import * as path from 'path';
import knexConfig from '../knexfile.js';
import { generateSqlDump, type DatabaseFormat, type ConflictMode } from '../utils/sql-dump.js';
import { loadConfigFile } from '../config/loader.js';

interface DbDumpArgs {
  from?: 'sqlite' | 'mysql' | 'postgresql';
  format: DatabaseFormat;
  output?: string;
  tables?: string;
  'chunk-size'?: number;
  'on-conflict'?: ConflictMode;
  'exclude-schema'?: boolean;
  'db-path'?: string;
  config?: string;
  'max-statements'?: number;
  help?: boolean;
}

/**
 * Show help message for db:dump command
 */
export function showDbDumpHelp(): void {
  console.log(`
sqlew db:dump - Generate SQL dump for database migration

USAGE:
  sqlew-cli db:dump --format=<format> [options]

REQUIRED OPTIONS:
  --format <format>        Target database format: mysql, postgresql, or sqlite

OPTIONS:
  --from <database>        Source database: sqlite, mysql, or postgresql (default: sqlite)
  --output <file>          Output file path (default: stdout)
  --tables <tables>        Comma-separated list of tables to dump (default: all)
  --chunk-size <number>    Rows per INSERT statement (default: 100)
  --max-statements <num>   Max statements per file - splits into multiple files if exceeded
                           (default: unlimited, recommended: 900 for MariaDB batch mode)
  --on-conflict <mode>     Duplicate key handling: error, ignore, replace (default: error)
                           - error: Standard INSERT (fails on duplicates)
                           - ignore: Skip duplicate rows (INSERT IGNORE/ON CONFLICT DO NOTHING)
                           - replace: Update existing rows (ON DUPLICATE KEY UPDATE/ON CONFLICT DO UPDATE)
  --exclude-schema         Exclude CREATE TABLE statements (data-only dump)
                           By default, schema is included for complete migration
  --db-path <path>         SQLite database file path (overrides config file)
  --config <path>          Config file path (default: auto-detect .sqlew/config.toml or config.toml)
  --help                   Show this help message

CONFIG FILE:
  The command automatically loads database settings from config.toml.
  Priority: CLI args > config file > environment variables > defaults

ENVIRONMENT VARIABLES (for MySQL/PostgreSQL sources):
  MYSQL_HOST               MySQL host (default: 127.0.0.1)
  MYSQL_PORT               MySQL port (default: 3306)
  MYSQL_USER               MySQL username
  MYSQL_PASSWORD           MySQL password
  MYSQL_DATABASE           MySQL database name

  PG_HOST                  PostgreSQL host (default: localhost)
  PG_PORT                  PostgreSQL port (default: 5432)
  PG_USER                  PostgreSQL username
  PG_PASSWORD              PostgreSQL password
  PG_DATABASE              PostgreSQL database name

EXAMPLES:
  # SQLite → MySQL (default source)
  sqlew-cli db:dump --format mysql --output dump-mysql.sql

  # MySQL → SQLite (reverse migration)
  sqlew-cli db:dump --from mysql --format sqlite --output dump-sqlite.sql

  # PostgreSQL → MySQL (cross-database)
  sqlew-cli db:dump --from postgresql --format mysql --output dump-mysql.sql

  # MySQL → PostgreSQL (cross-database)
  sqlew-cli db:dump --from mysql --format postgresql --output dump-pg.sql

  # Dump specific tables from PostgreSQL
  sqlew-cli db:dump --from postgresql --format sqlite --tables t_decisions,t_tasks

  # Split dump for MariaDB batch mode (1000 statement limit)
  sqlew-cli db:dump --format mysql --output dump.sql --max-statements=900

MIGRATION WORKFLOW:
  1. Create schema on target database:
     npm run migrate:latest --env=<target>

  2. Generate SQL dump from source:
     sqlew-cli db:dump --from=<source> --format=<target> --output=dump.sql

  3. Import data into target database:
     mysql < dump.sql    # for MySQL
     psql -f dump.sql    # for PostgreSQL
     sqlite3 db.db < dump.sql    # for SQLite
`);
}

/**
 * Parse command-line arguments for db:dump
 */
export function parseDbDumpArgs(args: string[]): DbDumpArgs {
  const parsed: Partial<DbDumpArgs> = {};

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
      } else if (key === 'exclude-schema') {
        parsed['exclude-schema'] = true;
      } else if (value && !value.startsWith('--')) {
        if (key === 'chunk-size') {
          parsed['chunk-size'] = parseInt(value, 10);
        } else if (key === 'max-statements') {
          parsed['max-statements'] = parseInt(value, 10);
        } else if (key === 'db-path') {
          parsed['db-path'] = value;
        } else if (key === 'config') {
          parsed.config = value;
        } else if (key === 'on-conflict') {
          parsed['on-conflict'] = value as ConflictMode;
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

  return parsed as DbDumpArgs;
}

/**
 * Validate db:dump arguments
 */
function validateArgs(args: DbDumpArgs): string | null {
  if (!args.format) {
    return 'Error: --format is required. Use one of: mysql, postgresql, sqlite';
  }

  if (!['mysql', 'postgresql', 'sqlite'].includes(args.format)) {
    return `Error: Invalid format "${args.format}". Use one of: mysql, postgresql, sqlite`;
  }

  if (args.from && !['sqlite', 'mysql', 'postgresql'].includes(args.from)) {
    return `Error: Invalid --from value "${args.from}". Use one of: sqlite, mysql, postgresql`;
  }

  if (args['chunk-size'] && (args['chunk-size'] < 1 || args['chunk-size'] > 10000)) {
    return 'Error: --chunk-size must be between 1 and 10000';
  }

  if (args['max-statements'] && args['max-statements'] < 1) {
    return 'Error: --max-statements must be at least 1';
  }

  if (args['on-conflict'] && !['error', 'ignore', 'replace'].includes(args['on-conflict'])) {
    return `Error: Invalid --on-conflict value "${args['on-conflict']}". Use one of: error, ignore, replace`;
  }

  return null;
}

/**
 * Split SQL dump into multiple files based on statement count
 * Returns array of written file paths
 */
function splitSqlByStatements(sql: string, maxStatements: number, baseFilename: string): string[] {
  const lines = sql.split('\n');
  const files: string[] = [];
  let currentStatements: string[] = [];
  let statementCount = 0;
  let partNumber = 1;
  let currentStatement = '';
  let inMultiLineComment = false;

  // Extract header (first few comment lines)
  const headerLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('--') || line.trim() === '') {
      headerLines.push(line);
    } else {
      break;
    }
  }

  // Process SQL lines
  for (let i = headerLines.length; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and single-line comments at start of line
    if (trimmedLine === '' || trimmedLine.startsWith('--')) {
      currentStatement += line + '\n';
      continue;
    }

    // Handle multi-line comments
    if (trimmedLine.includes('/*')) {
      inMultiLineComment = true;
    }
    if (trimmedLine.includes('*/')) {
      inMultiLineComment = false;
    }

    currentStatement += line + '\n';

    // Check for statement end (semicolon at end of line, not in comment)
    if (!inMultiLineComment && trimmedLine.endsWith(';')) {
      statementCount++;
      currentStatements.push(currentStatement);
      currentStatement = '';

      // Check if we need to split to new file
      if (statementCount >= maxStatements) {
        // Write current batch to file
        const filename = generatePartFilename(baseFilename, partNumber);
        const content = headerLines.join('\n') + '\n\n' + currentStatements.join('');
        fs.writeFileSync(filename, content, 'utf-8');
        files.push(filename);

        // Reset for next batch
        currentStatements = [];
        statementCount = 0;
        partNumber++;
      }
    }
  }

  // Write remaining statements
  if (currentStatements.length > 0 || currentStatement.trim() !== '') {
    if (currentStatement.trim() !== '') {
      currentStatements.push(currentStatement);
    }
    const filename = generatePartFilename(baseFilename, partNumber);
    const content = headerLines.join('\n') + '\n\n' + currentStatements.join('');
    fs.writeFileSync(filename, content, 'utf-8');
    files.push(filename);
  }

  return files;
}

/**
 * Generate part filename (e.g., dump.sql -> dump-part1.sql)
 */
function generatePartFilename(baseFilename: string, partNumber: number): string {
  const ext = path.extname(baseFilename);
  const base = baseFilename.slice(0, -ext.length);
  return `${base}-part${partNumber}${ext}`;
}

/**
 * Execute db:dump command
 */
export async function executeDbDump(args: DbDumpArgs): Promise<void> {
  // Show help if requested
  if (args.help) {
    showDbDumpHelp();
    return;
  }

  // Validate arguments
  const validationError = validateArgs(args);
  if (validationError) {
    console.error(validationError);
    console.error('Run "sqlew-cli db:dump --help" for usage information.');
    process.exit(1);
  }

  const format = args.format;
  const output = args.output;
  const tables = args.tables ? args.tables.split(',').map(t => t.trim()) : undefined;
  const chunkSize = args['chunk-size'] || 100;
  const conflictMode = args['on-conflict'] || 'error';
  const includeSchema = !args['exclude-schema'];  // Include schema by default

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

  // Determine source database - prioritize: CLI arg > config file > default
  const sourceDb = args.from || fileConfig.database?.type || 'sqlite';

  try {
    console.error(`Reading from ${sourceDb.toUpperCase()} database...`);
    console.error(`Generating ${format.toUpperCase()} dump...`);
    console.error(`Schema: ${includeSchema ? 'included' : 'excluded'}`);
    if (conflictMode !== 'error') {
      console.error(`Conflict resolution: ${conflictMode}`);
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
      // Generate SQL dump
      const sql = await generateSqlDump(db, format, {
        tables,
        includeHeader: true,
        includeSchema,
        chunkSize,
        conflictMode,
      });

      // Output to file or stdout
      if (output) {
        const maxStatements = args['max-statements'];

        if (maxStatements) {
          // Split SQL into multiple files based on statement count
          const files = splitSqlByStatements(sql, maxStatements, output);

          console.error(`✓ SQL dump split into ${files.length} file(s):`);
          files.forEach(f => console.error(`  - ${f}`));
          console.error(`\nNext steps:`);

          // Dynamic instructions based on target format
          const targetEnv = format === 'mysql' ? 'mysql' : format === 'postgresql' ? 'postgresql' : 'development';
          const importCmd = format === 'mysql' ?
            files.map(f => `mysql -h host -u user -p database < ${f}`).join('\n     ') :
            format === 'postgresql' ?
            files.map(f => `psql -h host -U user -d database -f ${f}`).join('\n     ') :
            files.map(f => `sqlite3 ${f.replace('.sql', '.db')} < ${f}`).join('\n     ');

          console.error(`  1. Create schema: npm run migrate:latest -- --env=${targetEnv}`);
          console.error(`  2. Import data (in order):`);
          console.error(`     ${importCmd}`);
        } else {
          // Single file output
          fs.writeFileSync(output, sql, 'utf-8');
          console.error(`✓ SQL dump written to: ${output}`);
          console.error(`\nNext steps:`);

          // Dynamic instructions based on target format
          const targetEnv = format === 'mysql' ? 'mysql' : format === 'postgresql' ? 'postgresql' : 'development';
          const importCmd = format === 'mysql' ? `mysql -h host -u user -p database < ${output}` :
                           format === 'postgresql' ? `psql -h host -U user -d database -f ${output}` :
                           `sqlite3 ${output.replace('.sql', '.db')} < ${output}`;

          console.error(`  1. Create schema: npm run migrate:latest -- --env=${targetEnv}`);
          console.error(`  2. Import data: ${importCmd}`);
        }
      } else {
        // Output to stdout (user can pipe to file or database)
        console.log(sql);
      }
    } finally {
      await db.destroy();
    }
  } catch (error) {
    console.error('Error generating SQL dump:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Main entry point for db:dump command
 */
export async function dbDumpCommand(args: string[]): Promise<void> {
  const parsedArgs = parseDbDumpArgs(args);
  await executeDbDump(parsedArgs);
}
