/**
 * MCP Server - Initialization and Setup
 * Handles database initialization, config loading, and file watcher setup
 *
 * Config Priority (v4.1.0+):
 * 1. Main repo config (worktree parent .sqlew/config.toml)
 * 2. Local config (.sqlew/config.toml)
 * 3. Global config (~/.config/sqlew/config.toml)
 * 4. Default behavior
 *
 * Note: .sqlew/ directory is NOT created if config specifies MySQL/PostgreSQL
 */

import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { DatabaseAdapter, initializeDatabase, setConfigValue, getAllConfig, getAdapter } from '../database.js';
import { CONFIG_KEYS } from '../constants.js';
import { loadConfigFile, DEFAULT_CONFIG_PATH } from '../config/loader.js';
import type { SqlewConfig } from '../config/types.js';
import { ensureProjectConfig } from '../config/writer.js';
import { ProjectContext } from '../utils/project-context.js';
import { detectVCS, GitAdapter } from '../utils/vcs-adapter.js';
import { FileWatcher } from '../watcher/index.js';
import { initDebugLogger, debugLog } from '../utils/debug-logger.js';
import { ensureSqlewDirectory } from '../config/example-generator.js';
import { determineProjectRoot } from '../utils/project-root.js';
import { ParsedArgs } from './arg-parser.js';
import { initializeSqlewIntegrations } from '../init-skills.js';
import { loadGlobalConfig } from '../config/global-config.js';

/**
 * Config source type for priority tracking
 */
type ConfigSource = 'worktree-parent' | 'local' | 'global' | 'default';

/**
 * Result of config loading with priority
 */
interface ConfigLoadResult {
  config: SqlewConfig;
  effectiveRoot: string;
  source: ConfigSource;
}

/**
 * Load config with priority order (v4.1.0+):
 * 1. Main repo config (worktree parent)
 * 2. Local config (.sqlew/config.toml)
 * 3. Global config (~/.config/sqlew/config.toml)
 * 4. Default behavior
 *
 * @param currentDir - Current working directory
 * @param parsedArgs - Parsed CLI arguments
 * @returns Config, effective root, and source
 */
async function loadConfigWithPriority(
  currentDir: string,
  parsedArgs: ParsedArgs
): Promise<ConfigLoadResult> {
  const localConfigPath = resolve(currentDir, DEFAULT_CONFIG_PATH);

  // Priority 1: Check if in worktree and main repo has config
  const gitAdapter = new GitAdapter(currentDir);
  const isWorktree = await gitAdapter.isWorktree();

  if (isWorktree) {
    const mainRepoRoot = await gitAdapter.getMainRepositoryRoot();
    if (mainRepoRoot) {
      const mainConfigPath = resolve(mainRepoRoot, DEFAULT_CONFIG_PATH);
      if (existsSync(mainConfigPath)) {
        // Use main repo config
        const config = loadConfigFile(mainRepoRoot, parsedArgs.configPath);
        return {
          config,
          effectiveRoot: mainRepoRoot,
          source: 'worktree-parent',
        };
      }
    }
  }

  // Priority 2: Local config
  if (existsSync(localConfigPath)) {
    const config = loadConfigFile(currentDir, parsedArgs.configPath);
    return {
      config,
      effectiveRoot: currentDir,
      source: 'local',
    };
  }

  // Priority 3: Global config
  const globalConfig = loadGlobalConfig();
  // Check if global config has meaningful database settings
  if (globalConfig.database?.type || globalConfig.database?.path) {
    // Merge global config with defaults
    const { DEFAULT_CONFIG } = await import('../config/types.js');

    // Build merged config - use type assertion for compatibility
    const mergedDatabase = {
      ...DEFAULT_CONFIG.database,
      ...globalConfig.database,
    } as SqlewConfig['database'];

    const config: SqlewConfig = {
      ...DEFAULT_CONFIG,
      database: mergedDatabase,
      autodelete: { ...DEFAULT_CONFIG.autodelete, ...globalConfig.autodelete },
      tasks: { ...DEFAULT_CONFIG.tasks, ...globalConfig.tasks },
      debug: { ...DEFAULT_CONFIG.debug, ...globalConfig.debug },
      agents: { ...DEFAULT_CONFIG.agents, ...globalConfig.agents },
      commands: { ...DEFAULT_CONFIG.commands, ...globalConfig.commands },
    };
    return {
      config,
      effectiveRoot: currentDir,
      source: 'global',
    };
  }

  // Priority 4: Default behavior
  const config = loadConfigFile(currentDir, parsedArgs.configPath);
  return {
    config,
    effectiveRoot: currentDir,
    source: 'default',
  };
}

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
  // 0. Determine current working directory
  const currentDir = determineProjectRoot({
    cliDbPath: parsedArgs.dbPath,
    cliConfigPath: parsedArgs.configPath,
  });

  // 1. Load config with priority order (v4.1.0+):
  //    Main repo (worktree parent) > Local > Global > Default
  const { config: fileConfig, effectiveRoot: finalProjectRoot, source: configSource } =
    await loadConfigWithPriority(currentDir, parsedArgs);

  // 2. Only create .sqlew/ if:
  //    - Using SQLite (not MySQL/PostgreSQL)
  //    - Config source is local or default (not worktree parent or global)
  const isExternalDB = fileConfig.database?.type === 'mysql' || fileConfig.database?.type === 'postgres';
  const shouldCreateLocalDir = !isExternalDB && (configSource === 'local' || configSource === 'default');

  if (shouldCreateLocalDir) {
    ensureSqlewDirectory(finalProjectRoot);
  }

  // Determine final database path
  // Priority: CLI --db-path > config file database.path > default
  // IMPORTANT: When using worktree-parent config, resolve relative paths from effectiveRoot (main repo)
  let dbPath = parsedArgs.dbPath || fileConfig.database?.path;
  if (dbPath && !isAbsolute(dbPath)) {
    // Relative path - resolve from effectiveRoot for worktree-parent/global, or currentDir for local/default
    if (configSource === 'worktree-parent' || configSource === 'global') {
      dbPath = resolve(finalProjectRoot, dbPath);
    }
  }

  // 3. Initialize debug logger (file-based logging, after config loaded)
  // Priority: CLI arg > environment variable > config file
  // IMPORTANT: When using worktree-parent config, resolve relative paths from effectiveRoot (main repo)
  let debugLogPath = parsedArgs.debugLogPath || process.env.SQLEW_DEBUG || fileConfig.debug?.log_path;
  if (debugLogPath && !isAbsolute(debugLogPath)) {
    if (configSource === 'worktree-parent' || configSource === 'global') {
      debugLogPath = resolve(finalProjectRoot, debugLogPath);
    }
  }
  const debugLogLevel = fileConfig.debug?.log_level || 'info';
  initDebugLogger(debugLogPath, debugLogLevel);

  debugLog('INFO', 'Config loaded with priority', {
    currentDir,
    finalProjectRoot,
    configSource,
    isExternalDB,
    shouldCreateLocalDir,
  });
  debugLog('INFO', 'Database path determined', { dbPath });

  // 4. Initialize database (SILENT - no stderr writes yet)
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

  // 5. Apply CLI config overrides (SILENT)
  if (parsedArgs.autodeleteIgnoreWeekend !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, parsedArgs.autodeleteIgnoreWeekend ? '1' : '0');
  }
  if (parsedArgs.autodeleteMessageHours !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, String(parsedArgs.autodeleteMessageHours));
  }
  if (parsedArgs.autodeleteFileHistoryDays !== undefined) {
    await setConfigValue(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, String(parsedArgs.autodeleteFileHistoryDays));
  }

  // 6. Read config values for diagnostics (SILENT)
  const configValues = await getAllConfig(db);
  const ignoreWeekend = configValues[CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND] === '1';
  const messageHours = configValues[CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS];
  const fileHistoryDays = configValues[CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS];

  // 7. Initialize ProjectContext (v3.7.0+ multi-project support)
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

  // 8. Initialize sqlew integrations (skills + CLAUDE.md + hooks) - silent, non-blocking
  // IMPORTANT: Use currentDir (worktree) not finalProjectRoot (main repo)
  // Skills, hooks, and CLAUDE.md should be installed where Claude Code is running
  try {
    initializeSqlewIntegrations(currentDir);
  } catch (error) {
    debugLog('WARN', 'Failed to initialize sqlew integrations', { error });
    // Non-fatal - continue server startup
  }

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
