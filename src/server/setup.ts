/**
 * MCP Server - Initialization and Setup
 * Handles database initialization, config loading, and file watcher setup
 */

import { DatabaseAdapter, initializeDatabase, setConfigValue, getAllConfig, getAdapter } from '../database.js';
import { CONFIG_KEYS } from '../constants.js';
import { loadConfigFile, DEFAULT_CONFIG_PATH } from '../config/loader.js';
import type { SqlewConfig } from '../config/types.js';
import { ensureProjectConfig } from '../config/writer.js';
import { ProjectContext } from '../utils/project-context.js';
import { detectVCS } from '../utils/vcs-adapter.js';
import { FileWatcher } from '../watcher/index.js';
import { initDebugLogger, debugLog } from '../utils/debug-logger.js';
import { ensureSqlewDirectory } from '../config/example-generator.js';
import { determineProjectRoot } from '../utils/project-root.js';
import { ParsedArgs } from './arg-parser.js';

export interface SetupResult {
  db: DatabaseAdapter;
  fileConfig: SqlewConfig;
  projectRoot: string;
  projectContext: ProjectContext;
  configValues: {
    ignoreWeekend: boolean;
    messageHours: string;
    fileHistoryDays: string;
  };
  detectionSource: 'cli' | 'config' | 'git' | 'metadata' | 'directory';
}

/**
 * Initialize server: database, config, project context, file watcher
 * Returns initialized components for server startup
 */
export async function initializeServer(parsedArgs: ParsedArgs): Promise<SetupResult> {
  // 0. Determine project root and load config (BEFORE logger init)
  const initialProjectRoot = determineProjectRoot({
    cliDbPath: parsedArgs.dbPath,
    cliConfigPath: parsedArgs.configPath,
  });

  const fileConfig = loadConfigFile(initialProjectRoot, parsedArgs.configPath);

  const finalProjectRoot = determineProjectRoot({
    cliDbPath: parsedArgs.dbPath,
    cliConfigPath: parsedArgs.configPath,
    configDbPath: fileConfig.database?.path,
  });

  ensureSqlewDirectory(finalProjectRoot);

  // Determine final database path
  // Priority: CLI --db-path > config file database.path > default
  const dbPath = parsedArgs.dbPath || fileConfig.database?.path;

  // 1. Initialize debug logger (file-based logging, after config loaded)
  // Priority: CLI arg > environment variable > config file
  const debugLogPath = parsedArgs.debugLogPath || process.env.SQLEW_DEBUG || fileConfig.debug?.log_path;
  const debugLogLevel = fileConfig.debug?.log_level || 'info';
  initDebugLogger(debugLogPath, debugLogLevel);

  debugLog('INFO', 'Project root determined', { finalProjectRoot });
  debugLog('INFO', 'Config loaded', { dbPath });

  // 2. Initialize database (SILENT - no stderr writes yet)
  let db: DatabaseAdapter;
  const isExplicitRDBMS = fileConfig.database?.type === 'mysql'
                       || fileConfig.database?.type === 'postgres';

  if (isExplicitRDBMS) {
    // User explicitly configured MySQL/PostgreSQL
    // Note: Config uses 'postgres' but initializeDatabase expects 'postgresql'
    const dbType = fileConfig.database!.type === 'postgres' ? 'postgresql' : fileConfig.database!.type;
    const config = {
      databaseType: dbType as 'mysql' | 'postgresql',
      connection: {
        ...fileConfig.database!.connection,
        user: fileConfig.database!.auth?.user,
        password: fileConfig.database!.auth?.password,
      },
    };

    try {
      db = await initializeDatabase(config);

      // Test connection immediately - fail fast if connection is bad
      await db.getKnex().raw('SELECT 1');
      debugLog('INFO', `Successfully connected to ${config.databaseType}`);
    } catch (error: any) {
      // Connection failed - EXIT WITHOUT SQLITE FALLBACK
      const errorMsg = `❌ Failed to connect to ${config.databaseType}: ${error.message}`;
      debugLog('ERROR', errorMsg, { error, stack: error.stack });
      console.error(errorMsg);
      console.error('Please check your .sqlew/config.toml database configuration and try again.');
      console.error('Connection details: host=' + config.connection.host + ', database=' + config.connection.database);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  } else {
    // SQLite (default or explicit) - backwards compatible behavior
    const config = dbPath
      ? { connection: { filename: dbPath } }
      : undefined;
    db = await initializeDatabase(config);
  }

  // 3. Apply CLI config overrides (SILENT)
  if (parsedArgs.autodeleteIgnoreWeekend !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, parsedArgs.autodeleteIgnoreWeekend ? '1' : '0');
  }
  if (parsedArgs.autodeleteMessageHours !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, String(parsedArgs.autodeleteMessageHours));
  }
  if (parsedArgs.autodeleteFileHistoryDays !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, String(parsedArgs.autodeleteFileHistoryDays));
  }

  // 4. Read config values for diagnostics (SILENT)
  const configValues = await getAllConfig(db);
  const ignoreWeekend = configValues[CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND] === '1';
  const messageHours = configValues[CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS];
  const fileHistoryDays = configValues[CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS];

  // 4.5. Initialize ProjectContext (v3.7.0+ multi-project support)
  const knex = getAdapter().getKnex();
  let projectName: string;
  let detectionSource: 'cli' | 'config' | 'git' | 'metadata' | 'directory' = 'directory';

  // Priority order: CLI --project-name > config.toml > git remote > directory name
  if (parsedArgs.projectName) {
    // CLI argument takes highest priority (for testing/override scenarios)
    projectName = parsedArgs.projectName;
    detectionSource = 'cli';
    debugLog('INFO', 'Project name from CLI argument', { projectName });
  } else if (fileConfig.project?.name) {
    // Config.toml is authoritative source
    projectName = fileConfig.project.name;
    detectionSource = 'config';
    debugLog('INFO', 'Project name from config.toml', { projectName });
  } else {
    // Detect from VCS or directory
    const vcsAdapter = await detectVCS(finalProjectRoot);

    if (vcsAdapter) {
      const detectedName = await vcsAdapter.extractProjectName();
      if (detectedName) {
        projectName = detectedName;
        detectionSource = 'git';
        debugLog('INFO', 'Project name detected from VCS', { projectName, vcs: vcsAdapter.getVCSType() });
      } else {
        // Fallback to directory name
        const dirSegments = finalProjectRoot.split('/').filter(s => s.length > 0);
        projectName = dirSegments[dirSegments.length - 1] || 'default';
        detectionSource = 'directory';
        debugLog('INFO', 'Project name from directory', { projectName });
      }
    } else {
      // No VCS detected, use directory name
      const dirSegments = finalProjectRoot.split('/').filter(s => s.length > 0);
      projectName = dirSegments[dirSegments.length - 1] || 'default';
      detectionSource = 'directory';
      debugLog('INFO', 'Project name from directory (no VCS)', { projectName });
    }

    // Write to config.toml if not present AND not CLI override
    if (!parsedArgs.projectName) {
      const configWritten = ensureProjectConfig(finalProjectRoot, projectName, {
        configPath: parsedArgs.configPath,
      });

      if (configWritten) {
        debugLog('INFO', 'Project name written to config.toml', {
          projectName,
          detectionSource,
          configPath: parsedArgs.configPath || DEFAULT_CONFIG_PATH
        });
      }
    }
  }

  // Initialize ProjectContext singleton
  const projectContext = ProjectContext.getInstance();
  await projectContext.ensureProject(knex, projectName, detectionSource, {
    projectRootPath: finalProjectRoot,
  });

  debugLog('INFO', 'ProjectContext initialized', {
    projectId: projectContext.getProjectId(),
    projectName: projectContext.getProjectName(),
  });

  // Log successful initialization
  debugLog('INFO', 'MCP Shared Context Server initialized', {
    dbPath,
    projectId: projectContext.getProjectId(),
    projectName: projectContext.getProjectName(),
    autoDeleteConfig: { messageHours, fileHistoryDays, ignoreWeekend },
    debugLogLevel: debugLogLevel
  });

  return {
    db,
    fileConfig,
    projectRoot: finalProjectRoot,
    projectContext,
    configValues: { ignoreWeekend, messageHours, fileHistoryDays },
    detectionSource,
  };
}

/**
 * Start file watcher for auto-task-tracking
 * Called after server is connected and ready
 */
export async function startFileWatcher(): Promise<void> {
  const watcher = FileWatcher.getInstance();
  await watcher.start();
}
