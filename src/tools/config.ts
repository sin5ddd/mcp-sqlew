/**
 * Config tool for MCP Shared Context Server
 * Manages per-project configuration with inheritance (project-specific > global)
 *
 * CONVERTED: Using Knex.js query builder only (NO knex.raw())
 */

import { DatabaseAdapter } from '../adapters/index.js';
import { getAdapter } from '../database.js';
import { getProjectContext } from '../utils/project-context.js';
import { validateActionParams } from '../utils/parameter-validator.js';
import connectionManager from '../utils/connection-manager.js';

/**
 * Get configuration value with per-project inheritance
 *
 * Lookup priority:
 * 1. Project-specific config (project_id = current project)
 * 2. Global config (project_id = NULL)
 *
 * @param params - Config key to retrieve
 * @param adapter - Optional database adapter (for testing)
 * @returns Config value or null if not found
 */
export async function getConfig(
  params: { key: string },
  adapter?: DatabaseAdapter
): Promise<{ key: string; value: string | null; scope: 'project' | 'global' | 'not_found' }> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('config', 'get', params);

    return await connectionManager.executeWithRetry(async () => {
      const projectId = getProjectContext().getProjectId();
      const configKey = params.key;

      // Try project-specific config first
      let config = await knex('m_config')
        .where({ key: configKey, project_id: projectId })
        .first<{ key: string; value: string }>();

      if (config) {
        return {
          key: config.key,
          value: config.value,
          scope: 'project'
        };
      }

      // Fallback to global config (project_id = NULL)
      config = await knex('m_config')
        .where({ key: configKey })
        .whereNull('project_id')
        .first<{ key: string; value: string }>();

      if (config) {
        return {
          key: config.key,
          value: config.value,
          scope: 'global'
        };
      }

      // Not found
      return {
        key: configKey,
        value: null,
        scope: 'not_found'
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get config: ${message}`);
  }
}

/**
 * Update configuration value (project-specific or global)
 *
 * @param params - Config key, value, and optional scope
 * @param adapter - Optional database adapter (for testing)
 * @returns Success status
 */
export async function updateConfig(
  params: {
    key: string;
    value: string;
    scope?: 'project' | 'global';
  },
  adapter?: DatabaseAdapter
): Promise<{ success: boolean; key: string; value: string; scope: 'project' | 'global' }> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    // Validate parameters
    validateActionParams('config', 'update', params);

    return await connectionManager.executeWithRetry(async () => {
      const configKey = params.key;
      const configValue = params.value;
      const scope = params.scope || 'project'; // Default to project-specific

      // Determine project_id based on scope
      const projectId = scope === 'global' ? null : getProjectContext().getProjectId();

      // Use Knex insert with onConflict for upsert (works across SQLite, MySQL, PostgreSQL)
      await knex('m_config')
        .insert({
          key: configKey,
          project_id: projectId,
          value: configValue
        })
        .onConflict(['key', 'project_id'])
        .merge({ value: configValue });

      return {
        success: true,
        key: configKey,
        value: configValue,
        scope: scope
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update config: ${message}`);
  }
}

/**
 * Get help documentation for config tool
 * @returns Help documentation object
 */
export function configHelp(): any {
  return {
    tool: 'config',
    description: 'Manage per-project configuration with inheritance',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios for config actions.',
    config_inheritance: {
      priority: 'Project-specific config > Global config',
      scopes: {
        project: 'Config specific to current project (default for update)',
        global: 'Config shared across all projects (project_id = NULL)'
      }
    },
    actions: {
      get: 'Get configuration value with inheritance. Params: key (string)',
      update: 'Set configuration value. Params: key (string), value (string), scope ("project" | "global", default: "project")'
    },
    examples: {
      get: '{ action: "get", key: "autodelete_message_hours" }',
      update_project: '{ action: "update", key: "autodelete_message_hours", value: "48", scope: "project" }',
      update_global: '{ action: "update", key: "autodelete_message_hours", value: "72", scope: "global" }'
    },
    common_config_keys: [
      'autodelete_message_hours',
      'autodelete_file_history_days',
      'autodelete_ignore_weekend'
    ]
  };
}

/**
 * Get comprehensive examples for config tool
 * @returns Examples documentation object
 */
export function configExample(): any {
  return {
    tool: 'config',
    description: 'Per-project configuration management examples',
    scenarios: {
      get_with_inheritance: {
        title: 'Get Config with Automatic Inheritance',
        steps: [
          {
            step: 1,
            action: 'Get config (will check project-specific first, then global)',
            request: '{ action: "get", key: "autodelete_message_hours" }',
            response: '{ key: "autodelete_message_hours", value: "48", scope: "project" }'
          },
          {
            step: 2,
            action: 'If no project-specific config exists, returns global',
            request: '{ action: "get", key: "autodelete_ignore_weekend" }',
            response: '{ key: "autodelete_ignore_weekend", value: "true", scope: "global" }'
          },
          {
            step: 3,
            action: 'If neither exists, returns not_found',
            request: '{ action: "get", key: "nonexistent_key" }',
            response: '{ key: "nonexistent_key", value: null, scope: "not_found" }'
          }
        ]
      },
      project_specific_override: {
        title: 'Override Global Config for Specific Project',
        workflow: [
          {
            step: 1,
            description: 'Set global config (applies to all projects)',
            request: '{ action: "update", key: "autodelete_message_hours", value: "72", scope: "global" }'
          },
          {
            step: 2,
            description: 'Override for current project (project-specific takes precedence)',
            request: '{ action: "update", key: "autodelete_message_hours", value: "24", scope: "project" }'
          },
          {
            step: 3,
            description: 'Get config - returns project-specific value',
            request: '{ action: "get", key: "autodelete_message_hours" }',
            response: '{ key: "autodelete_message_hours", value: "24", scope: "project" }'
          }
        ]
      },
      global_config_fallback: {
        title: 'Global Config as Fallback',
        example: {
          scenario: 'Project without specific config uses global default',
          global_config: '{ action: "update", key: "autodelete_file_history_days", value: "14", scope: "global" }',
          get_request: '{ action: "get", key: "autodelete_file_history_days" }',
          response: '{ key: "autodelete_file_history_days", value: "14", scope: "global" }',
          explanation: 'No project-specific config exists, so global config is returned'
        }
      }
    },
    best_practices: {
      scopes: [
        'Use "global" scope for organization-wide defaults',
        'Use "project" scope (default) for project-specific overrides',
        'Get action automatically handles inheritance (no need to specify scope)'
      ],
      common_patterns: [
        'Set global defaults first, then override per-project as needed',
        'Use consistent key names across projects for easier management',
        'Document project-specific overrides in project documentation'
      ]
    }
  };
}

/**
 * Get use case documentation for config tool
 * @returns Use case documentation object
 */
export function configUseCase(): any {
  return {
    tool: 'config',
    description: 'When to use per-project configuration',
    use_cases: [
      {
        id: 'config_uc_001',
        title: 'Multi-Project Retention Policies',
        scenario: 'Different projects have different data retention requirements',
        example: {
          problem: 'Production project needs 7-day retention, staging needs 2-day',
          solution: [
            '1. Set global default: { action: "update", key: "autodelete_file_history_days", value: "7", scope: "global" }',
            '2. Override for staging: { action: "update", key: "autodelete_file_history_days", value: "2", scope: "project" }'
          ],
          benefit: 'Each project gets appropriate retention without code changes'
        }
      },
      {
        id: 'config_uc_002',
        title: 'Weekend-Aware Mode Per Project',
        scenario: 'Some projects operate 24/7, others are business-hours only',
        example: {
          problem: 'E-commerce project is 24/7, internal tools are Mon-Fri',
          solution: [
            '1. Global default (24/7): { action: "update", key: "autodelete_ignore_weekend", value: "false", scope: "global" }',
            '2. Business-hours project: { action: "update", key: "autodelete_ignore_weekend", value: "true", scope: "project" }'
          ],
          benefit: 'Retention logic respects project operational hours'
        }
      },
      {
        id: 'config_uc_003',
        title: 'Organizational Defaults with Project Flexibility',
        scenario: 'Organization sets standards but allows project-level adjustments',
        example: {
          problem: 'Company standard is 48h message retention, but critical projects need 1 week',
          solution: [
            '1. Set org standard: { action: "update", key: "autodelete_message_hours", value: "48", scope: "global" }',
            '2. Critical projects override: { action: "update", key: "autodelete_message_hours", value: "168", scope: "project" }'
          ],
          benefit: 'Centralized defaults with granular control where needed'
        }
      }
    ],
    when_to_use: {
      use_project_scope: [
        'Project has unique requirements different from organization defaults',
        'Temporary adjustments needed for specific project phase (e.g., launch, debugging)',
        'Project operates under different compliance/retention rules'
      ],
      use_global_scope: [
        'Setting organization-wide standards and defaults',
        'Ensuring consistency across all projects without overrides',
        'Establishing baseline configuration for new projects'
      ]
    }
  };
}
