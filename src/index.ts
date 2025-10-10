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
import { initializeDatabase, closeDatabase } from './database.js';
import { setDecision, getContext, getDecision } from './tools/context.js';
import type {
  SetDecisionParams,
  GetContextParams,
  GetDecisionParams
} from './types.js';

// Parse command-line arguments for database path
const args = process.argv.slice(2);
const dbPath = args.length > 0 ? args[0] : undefined;

// Initialize database
let db;
try {
  db = initializeDatabase(dbPath);
  console.error('✓ MCP Shared Context Server initialized');
} catch (error) {
  console.error('✗ Failed to initialize database:', error);
  process.exit(1);
}

// Create MCP server
const server = new Server(
  {
    name: 'mcp-sklew',
    version: '1.0.0',
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
        name: 'set_decision',
        description: 'Set or update a decision in the shared context. Auto-detects numeric vs string values. Supports tags, layers, scopes, and version tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Unique key for the decision (e.g., "auth_method", "max_connections")',
            },
            value: {
              type: ['string', 'number'],
              description: 'Decision value (string or numeric). Numeric values are stored in optimized table.',
            },
            agent: {
              type: 'string',
              description: 'Name of the agent making the decision (defaults to "system")',
            },
            layer: {
              type: 'string',
              description: 'Architecture layer (presentation, business, data, infrastructure, cross-cutting)',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            version: {
              type: 'string',
              description: 'Version identifier (defaults to "1.0.0"). Used for change tracking.',
            },
            status: {
              type: 'string',
              description: 'Decision status (defaults to "active")',
              enum: ['active', 'deprecated', 'draft'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (e.g., ["authentication", "security"])',
            },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Module or component scopes (e.g., ["user-service", "api"])',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'get_context',
        description: 'Retrieve decisions with advanced filtering. Returns token-efficient view with all metadata. Supports filtering by status, layer, tags, and scope.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by decision status',
              enum: ['active', 'deprecated', 'draft'],
            },
            layer: {
              type: 'string',
              description: 'Filter by architecture layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (use tag_match to control AND/OR logic)',
            },
            scope: {
              type: 'string',
              description: 'Filter by specific scope/module',
            },
            tag_match: {
              type: 'string',
              description: 'Tag matching mode: "AND" (all tags required) or "OR" (any tag)',
              enum: ['AND', 'OR'],
              default: 'OR',
            },
          },
        },
      },
      {
        name: 'get_decision',
        description: 'Get a specific decision by key. Returns full metadata including tags, layer, scopes, version, and timestamp.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Decision key to retrieve',
            },
          },
          required: ['key'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'set_decision': {
        const params = args as unknown as SetDecisionParams;
        const result = setDecision(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_context': {
        const params = args as unknown as GetContextParams;
        const result = getContext(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_decision': {
        const params = args as unknown as GetDecisionParams;
        const result = getDecision(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\n✓ Shutting down MCP server...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n✓ Shutting down MCP server...');
  closeDatabase();
  process.exit(0);
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✓ MCP Shared Context Server running on stdio');
}

main().catch((error) => {
  console.error('✗ Fatal error:', error);
  closeDatabase();
  process.exit(1);
});
