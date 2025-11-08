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
import { parseArgs, validateArgs } from './server/arg-parser.js';
import { getToolRegistry } from './server/tool-registry.js';
import { handleToolCall } from './server/tool-handlers.js';
import { initializeServer, startFileWatcher } from './server/setup.js';
import { registerShutdownHandlers, performCleanup } from './server/shutdown.js';
import { handleInitializationError, safeConsoleError } from './utils/error-handler.js';

// Parse command-line arguments
const args = process.argv.slice(2);
const parsedArgs = parseArgs(args);

// Validate arguments (throws if invalid)
try {
  validateArgs(parsedArgs);
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// Create MCP server
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
    tools: getToolRegistry(),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await handleToolCall(request);
});

// Setup centralized global error handlers
registerShutdownHandlers();

// Start server with stdio transport
async function main() {
  let debugLoggerInitialized = false;

  try {
    // Initialize server (database, config, project context)
    const setupResult = await initializeServer(parsedArgs);
    debugLoggerInitialized = true;

    // Connect MCP server transport FIRST (before any stderr writes)
    // This prevents EPIPE errors with clients expecting pure JSON-RPC protocol
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // NOW safe to write diagnostic messages (using EPIPE-safe wrapper)
    safeConsoleError('✓ MCP Shared Context Server running on stdio');

    const dbPath = parsedArgs.dbPath || setupResult.fileConfig.database?.path;
    if (dbPath) {
      const source = parsedArgs.dbPath ? 'CLI' : 'config file';
      safeConsoleError(`  Database: ${dbPath} (from ${source})`);
    }

    safeConsoleError(`  Project: ${setupResult.projectContext.getProjectName()} (ID: ${setupResult.projectContext.getProjectId()}, source: ${setupResult.detectionSource})`);
    safeConsoleError(`  Auto-delete config: messages=${setupResult.configValues.messageHours}h, file_history=${setupResult.configValues.fileHistoryDays}d, ignore_weekend=${setupResult.configValues.ignoreWeekend}`);

    // Start file watcher for auto-task-tracking (after database is ready)
    try {
      await startFileWatcher();
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

    performCleanup();
    process.exit(1);
  }
}

main().catch((error) => {
  // Use centralized initialization error handler (writes to log file)
  safeConsoleError('\n❌ FATAL ERROR:');
  handleInitializationError(error);

  performCleanup();
  process.exit(1);
});
