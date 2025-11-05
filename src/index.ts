#!/usr/bin/env node
/**
 * MCP Shared Context Server - Entry Point
 * Provides context management tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initializeDatabase, closeDatabase, setConfigValue, getAllConfig, DatabaseAdapter, getAdapter } from './database.js';
import { CONFIG_KEYS } from './constants.js';
import { loadConfigFile, DEFAULT_CONFIG_PATH } from './config/loader.js';
import { hasProjectName, ensureProjectConfig } from './config/writer.js';
import { ProjectContext } from './utils/project-context.js';
import { detectVCS } from './utils/vcs-adapter.js';
import { setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer, quickSetDecision, searchAdvanced, setDecisionBatch, hasUpdates, setFromTemplate, createTemplate, listTemplates, hardDeleteDecision, addDecisionContextAction, listDecisionContextsAction, decisionHelp, decisionExample } from './tools/context.js';
import { sendMessage, getMessages, markRead, sendMessageBatch, messageHelp, messageExample } from './tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch, fileHelp, fileExample } from './tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint, constraintHelp, constraintExample } from './tools/constraints.js';
import { getLayerSummary, clearOldData, getStats, getActivityLog, flushWAL, statsHelp, statsExample } from './tools/utils.js';
import { createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask, batchCreateTasks, addDependency, removeDependency, getDependencies, watchFiles, getPrunedFiles, linkPrunedFile, taskHelp, taskExample, watcherStatus } from './tools/tasks.js';
import { FileWatcher } from './watcher/index.js';
import { trackAndReturnHelp } from './utils/help-tracking.js';
import { queryHelpAction, queryHelpParams, queryHelpTool, queryHelpUseCase, queryHelpListUseCases, queryHelpNextActions } from './tools/help-queries.js';
import { initDebugLogger, closeDebugLogger, debugLog, debugLogToolCall, debugLogToolResponse, debugLogError } from './utils/debug-logger.js';
import { handleToolError, handleInitializationError, setupGlobalErrorHandlers, safeConsoleError } from './utils/error-handler.js';
import { ensureSqlewDirectory } from './config/example-generator.js';
import { DecisionAction, TaskAction, FileAction, ConstraintAction, StatsAction, MessageAction } from './types.js';
import { determineProjectRoot } from './utils/project-root.js';

// Parse command-line arguments
const args = process.argv.slice(2);
const parsedArgs: {
  configPath?: string;
  dbPath?: string;
  projectName?: string;
  autodeleteIgnoreWeekend?: boolean;
  autodeleteMessageHours?: number;
  autodeleteFileHistoryDays?: number;
  debugLogPath?: string;
} = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg.startsWith('--config=')) {
    parsedArgs.configPath = arg.split('=')[1];
  } else if (arg === '--config' && i + 1 < args.length) {
    parsedArgs.configPath = args[++i];
  } else if (arg.startsWith('--db-path=')) {
    parsedArgs.dbPath = arg.split('=')[1];
  } else if (arg === '--db-path' && i + 1 < args.length) {
    parsedArgs.dbPath = args[++i];
  } else if (arg.startsWith('--config-path=')) {
    parsedArgs.configPath = arg.split('=')[1];
  } else if (arg === '--config-path' && i + 1 < args.length) {
    parsedArgs.configPath = args[++i];
  } else if (arg.startsWith('--autodelete-ignore-weekend=')) {
    const value = arg.split('=')[1].toLowerCase();
    parsedArgs.autodeleteIgnoreWeekend = value === 'true' || value === '1';
  } else if (arg === '--autodelete-ignore-weekend') {
    parsedArgs.autodeleteIgnoreWeekend = true;
  } else if (arg.startsWith('--autodelete-message-hours=')) {
    parsedArgs.autodeleteMessageHours = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--autodelete-message-hours' && i + 1 < args.length) {
    parsedArgs.autodeleteMessageHours = parseInt(args[++i], 10);
  } else if (arg.startsWith('--autodelete-file-history-days=')) {
    parsedArgs.autodeleteFileHistoryDays = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--autodelete-file-history-days' && i + 1 < args.length) {
    parsedArgs.autodeleteFileHistoryDays = parseInt(args[++i], 10);
  } else if (arg.startsWith('--debug-log=')) {
    parsedArgs.debugLogPath = arg.split('=')[1];
  } else if (arg === '--debug-log' && i + 1 < args.length) {
    parsedArgs.debugLogPath = args[++i];
  } else if (arg.startsWith('--project-name=')) {
    parsedArgs.projectName = arg.split('=')[1];
  } else if (arg === '--project-name' && i + 1 < args.length) {
    parsedArgs.projectName = args[++i];
  } else if (!arg.startsWith('--')) {
    // Backward compatibility: first non-flag argument is dbPath
    if (!parsedArgs.dbPath) {
      parsedArgs.dbPath = arg;
    }
  }
}

// Initialize database (will be set after async init completes)
let db: DatabaseAdapter;

// Create MCP server (will be initialized in main())
const server = new Server(
  {
    name: 'mcp-sqlew',
    version: '3.6.6',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'decision',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Context Management - Store decisions with metadata (tags, layers, versions, scopes)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'quick_set', 'search_advanced', 'set_batch', 'has_updates', 'set_from_template', 'create_template', 'list_templates', 'hard_delete', 'add_decision_context', 'list_decision_contexts', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
      {
        name: 'message',
        description: `⚠️ DEPRECATED (v3.6.6) - This tool is deprecated and will be removed in future versions.

The messaging system was unused and has been removed. The t_agent_messages table no longer exists.
All actions will return deprecation warnings and are non-operational.

**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['send', 'get', 'mark_read', 'send_batch', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
      {
        name: 'file',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

File Change Tracking - Track file changes with layer classification and lock detection

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['record', 'get', 'check_lock', 'record_batch', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
      {
        name: 'constraint',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Constraint Management - Manage architectural rules and requirements

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['add', 'get', 'deactivate', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
      {
        name: 'stats',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Statistics & Utilities - View stats, activity logs, manage data cleanup, and WAL checkpoints

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['layer_summary', 'db_stats', 'clear', 'activity_log', 'flush', 'help_action', 'help_params', 'help_tool', 'help_use_case', 'help_list_use_cases', 'help_next_actions', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
      {
        name: 'task',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Kanban Task Watcher - AI-optimized task management with auto-stale detection

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.
Use action: "use_case" for practical scenarios and when-to-use guidance.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['create', 'update', 'get', 'list', 'move', 'link', 'archive', 'batch_create', 'add_dependency', 'remove_dependency', 'get_dependencies', 'watch_files', 'watcher', 'help', 'example', 'use_case']
            }
          },
          required: ['action'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as any;
  const action = params.action || 'N/A';

  // Debug logging: Tool call
  debugLogToolCall(name, action, params);

  try {
    let result;

    switch (name) {
      case 'decision': {
        const action = params.action as DecisionAction;
        switch (action) {
          case 'set': result = await setDecision(params); break;
          case 'get': result = await getDecision(params); break;
          case 'list': result = await getContext(params); break;
          case 'search_tags': result = await searchByTags({ tags: params.tags, match_mode: params.tag_match, status: params.status, layer: params.layer }); break;
          case 'search_layer': result = await searchByLayer({ layer: params.layer, status: params.status, include_tags: params.include_tags }); break;
          case 'versions': result = await getVersions(params); break;
          case 'quick_set': result = await quickSetDecision(params); break;
          case 'search_advanced': result = await searchAdvanced({
            layers: params.layers,
            tags_all: params.tags_all,
            tags_any: params.tags_any,
            exclude_tags: params.exclude_tags,
            scopes: params.scopes,
            updated_after: params.updated_after,
            updated_before: params.updated_before,
            decided_by: params.decided_by,
            statuses: params.statuses,
            search_text: params.search_text,
            sort_by: params.sort_by,
            sort_order: params.sort_order,
            limit: params.limit,
            offset: params.offset
          }); break;
          case 'set_batch': result = await setDecisionBatch({ decisions: params.decisions, atomic: params.atomic }); break;
          case 'has_updates': result = await hasUpdates({ agent_name: params.agent_name, since_timestamp: params.since_timestamp }); break;
          case 'set_from_template': result = await setFromTemplate(params); break;
          case 'create_template': result = await createTemplate(params); break;
          case 'list_templates': result = await listTemplates(params); break;
          case 'hard_delete': result = await hardDeleteDecision(params); break;
          case 'add_decision_context': result = await addDecisionContextAction(params); break;
          case 'list_decision_contexts': result = await listDecisionContextsAction(params); break;
          case 'help':
            const helpContent = decisionHelp();
            trackAndReturnHelp('decision', 'help', JSON.stringify(helpContent));
            result = helpContent;
            break;
          case 'example':
            const exampleContent = decisionExample();
            trackAndReturnHelp('decision', 'example', JSON.stringify(exampleContent));
            result = exampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'message': {
        const action = params.action as MessageAction;
        switch (action) {
          case 'send': result = await sendMessage(params); break;
          case 'get': result = await getMessages(params); break;
          case 'mark_read': result = await markRead(params); break;
          case 'send_batch': result = await sendMessageBatch({ messages: params.messages, atomic: params.atomic }); break;
          case 'help':
            const msgHelpContent = messageHelp();
            trackAndReturnHelp('message', 'help', JSON.stringify(msgHelpContent));
            result = msgHelpContent;
            break;
          case 'example':
            const msgExampleContent = messageExample();
            trackAndReturnHelp('message', 'example', JSON.stringify(msgExampleContent));
            result = msgExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'file': {
        const action = params.action as FileAction;
        switch (action) {
          case 'record': result = await recordFileChange(params); break;
          case 'get': result = await getFileChanges(params); break;
          case 'check_lock': result = await checkFileLock(params); break;
          case 'record_batch': result = await recordFileChangeBatch({ file_changes: params.file_changes, atomic: params.atomic }); break;
          case 'help':
            const fileHelpContent = fileHelp();
            trackAndReturnHelp('file', 'help', JSON.stringify(fileHelpContent));
            result = fileHelpContent;
            break;
          case 'example':
            const fileExampleContent = fileExample();
            trackAndReturnHelp('file', 'example', JSON.stringify(fileExampleContent));
            result = fileExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'constraint': {
        const action = params.action as ConstraintAction;
        switch (action) {
          case 'add': result = await addConstraint(params); break;
          case 'get': result = await getConstraints(params); break;
          case 'deactivate': result = await deactivateConstraint(params); break;
          case 'help':
            const constraintHelpContent = constraintHelp();
            trackAndReturnHelp('constraint', 'help', JSON.stringify(constraintHelpContent));
            result = constraintHelpContent;
            break;
          case 'example':
            const constraintExampleContent = constraintExample();
            trackAndReturnHelp('constraint', 'example', JSON.stringify(constraintExampleContent));
            result = constraintExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'stats': {
        const action = params.action as StatsAction;
        switch (action) {
          case 'layer_summary': result = await getLayerSummary(); break;
          case 'db_stats': result = await getStats(); break;
          case 'clear': result = await clearOldData(params); break;
          case 'activity_log': result = await getActivityLog({
            since: params.since,
            agent_names: params.agent_names,
            actions: params.actions,
            limit: params.limit,
          }); break;
          case 'flush': result = await flushWAL(); break;
          case 'help_action':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpAction(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help_params':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpParams(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help_tool':
            if (!params.tool) {
              result = { error: 'Parameter "tool" is required' };
            } else {
              result = await queryHelpTool(getAdapter(), params.tool);
            }
            break;
          case 'help_use_case':
            if (!params.use_case_id) {
              result = { error: 'Parameter "use_case_id" is required' };
            } else {
              result = await queryHelpUseCase(getAdapter(), params.use_case_id);
            }
            break;
          case 'help_list_use_cases':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          case 'help_next_actions':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpNextActions(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help':
            const statsHelpContent = statsHelp();
            trackAndReturnHelp('stats', 'help', JSON.stringify(statsHelpContent));
            result = statsHelpContent;
            break;
          case 'example':
            const statsExampleContent = statsExample();
            trackAndReturnHelp('stats', 'example', JSON.stringify(statsExampleContent));
            result = statsExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'task': {
        const action = params.action as TaskAction;
        switch (action) {
          case 'create': result = await createTask(params); break;
          case 'update': result = await updateTask(params); break;
          case 'get': result = await getTask(params); break;
          case 'list': result = await listTasks(params); break;
          case 'move': result = await moveTask(params); break;
          case 'link': result = await linkTask(params); break;
          case 'archive': result = await archiveTask(params); break;
          case 'batch_create': result = await batchCreateTasks({ tasks: params.tasks, atomic: params.atomic }); break;
          case 'add_dependency': result = await addDependency(params); break;
          case 'remove_dependency': result = await removeDependency(params); break;
          case 'get_dependencies': result = await getDependencies(params); break;
          case 'watch_files': result = await watchFiles(params); break;
          case 'get_pruned_files': result = await getPrunedFiles(params); break;
          case 'link_pruned_file': result = await linkPrunedFile(params); break;
          case 'watcher': result = await watcherStatus(params); break;
          case 'help':
            const taskHelpContent = taskHelp();
            trackAndReturnHelp('task', 'help', JSON.stringify(taskHelpContent));
            result = taskHelpContent;
            break;
          case 'example':
            const taskExampleContent = taskExample();
            trackAndReturnHelp('task', 'example', JSON.stringify(taskExampleContent));
            result = taskExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Debug logging: Success
    debugLogToolResponse(name, action, true, result);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    // Use centralized error handler (stack goes to logs only, not returned to client)
    const { message } = handleToolError(name, action, error, params);
    debugLogToolResponse(name, action, false, undefined, { message });

    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

// Setup centralized global error handlers
setupGlobalErrorHandlers(() => {
  debugLog('INFO', 'Shutting down gracefully');
  try {
    const watcher = FileWatcher.getInstance();
    watcher.stop();
  } catch (error) {
    // Ignore watcher errors during shutdown
  }
  closeDatabase();
  closeDebugLogger();
});

// Start server with stdio transport
async function main() {
  let debugLoggerInitialized = false;

  try {
    // 0. Determine project root and load config (BEFORE logger init)
    // This must happen first to get debug log path from config
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
    debugLoggerInitialized = true;

    debugLog('INFO', 'Project root determined', { finalProjectRoot });
    debugLog('INFO', 'Config loaded', { dbPath });

    // 2. Initialize database (SILENT - no stderr writes yet)
    // Note: .sqlew directory already created above with correct project root
    // Build config from fileConfig (which includes database type and auth for multi-RDBMS)
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
        process.exit(1);
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
    // Must happen AFTER database init, BEFORE server.connect()
    // Satisfies Constraints #23, #24, #41
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
      // Config.toml is authoritative source (Constraint #24)
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

      // Write to config.toml if not present AND not CLI override (Constraint #23)
      // Don't write if CLI override is used (temporary override scenario)
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

    // Initialize ProjectContext singleton (Constraint #41)
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

    // 5. Connect MCP server transport FIRST (before any stderr writes)
    // This prevents EPIPE errors with clients expecting pure JSON-RPC protocol
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // 6. NOW safe to write diagnostic messages (using EPIPE-safe wrapper)
    safeConsoleError('✓ MCP Shared Context Server running on stdio');
    if (dbPath) {
      const source = parsedArgs.dbPath ? 'CLI' : 'config file';
      safeConsoleError(`  Database: ${dbPath} (from ${source})`);
    }
    safeConsoleError(`  Project: ${projectContext.getProjectName()} (ID: ${projectContext.getProjectId()}, source: ${detectionSource})`);
    safeConsoleError(`  Auto-delete config: messages=${messageHours}h, file_history=${fileHistoryDays}d, ignore_weekend=${ignoreWeekend}`);

    // 7. Start file watcher for auto-task-tracking (after database is ready)
    try {
      const watcher = FileWatcher.getInstance();
      await watcher.start();
    } catch (error) {
      safeConsoleError('⚠ Failed to start file watcher:', error);
      safeConsoleError('  (Auto task tracking will be disabled)');
    }
  } catch (error) {
    // If debug logger not initialized, write to stderr as fallback
    if (!debugLoggerInitialized) {
      console.error('\n❌ EARLY INITIALIZATION ERROR (before debug logger):', error);
      if (error instanceof Error && error.stack) {
        console.error('Stack:', error.stack);
      }
    }

    // Use centralized initialization error handler (writes to log file)
    handleInitializationError(error);

    closeDatabase();
    closeDebugLogger();
    process.exit(1);
  }
}

main().catch((error) => {
  // Use centralized initialization error handler (writes to log file)
  safeConsoleError('\n❌ FATAL ERROR:');
  handleInitializationError(error);

  closeDatabase();
  closeDebugLogger();
  process.exit(1);
});
