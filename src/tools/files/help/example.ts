/**
 * Example action for file tool
 */

export function fileExample(): any {
  return {
    tool: 'file',
    description: 'Comprehensive file tracking examples for multi-agent coordination',
    scenarios: {
      basic_tracking: {
        title: 'Basic File Change Tracking',
        examples: [
          {
            scenario: 'Record file modification',
            request: '{ action: "record", file_path: "src/api/users.ts", agent_name: "refactor-agent", change_type: "modified", layer: "business", description: "Added email validation" }',
            explanation: 'Track changes with layer and description'
          },
          {
            scenario: 'Get recent changes by agent',
            request: '{ action: "get", agent_name: "refactor-agent", limit: 10 }',
            explanation: 'View what an agent has been working on'
          },
          {
            scenario: 'Track changes to specific file',
            request: '{ action: "get", file_path: "src/api/users.ts" }',
            explanation: 'See all modifications to a particular file'
          }
        ]
      },
      file_locking: {
        title: 'Concurrent Access Prevention',
        workflow: [
          {
            step: 1,
            action: 'Check if file is locked',
            request: '{ action: "check_lock", file_path: "src/database/schema.sql", lock_duration: 300 }',
            result: '{ locked: false } or { locked: true, locked_by: "agent-name", locked_at: "timestamp" }'
          },
          {
            step: 2,
            action: 'If not locked, record change (creates lock)',
            request: '{ action: "record", file_path: "src/database/schema.sql", agent_name: "migration-agent", change_type: "modified" }'
          },
          {
            step: 3,
            action: 'Lock expires after 5 minutes (default) or specified duration'
          }
        ]
      },
      layer_organization: {
        title: 'Tracking by Architecture Layer',
        examples: [
          {
            scenario: 'Get all presentation layer changes',
            request: '{ action: "get", layer: "presentation", limit: 20 }',
            explanation: 'View frontend/UI changes across agents'
          },
          {
            scenario: 'Track infrastructure changes',
            request: '{ action: "get", layer: "infrastructure", change_type: "modified" }',
            explanation: 'Monitor config and deployment file changes'
          }
        ]
      },
      batch_tracking: {
        title: 'Batch File Operations',
        examples: [
          {
            scenario: 'Record multiple file changes atomically',
            request: '{ action: "record_batch", file_changes: [{"file_path": "src/api.ts", "agent_name": "bot1", "change_type": "modified", "layer": "presentation"}, {"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}], atomic: true }',
            explanation: 'All changes recorded or none (transaction)'
          }
        ]
      }
    },
    best_practices: {
      change_tracking: [
        'Always specify layer for better organization',
        'Include description for non-obvious changes',
        'Use check_lock before modifying shared files',
        'Track both creation and deletion of files'
      ],
      lock_management: [
        'Default lock duration is 300 seconds (5 minutes)',
        'Locks prevent concurrent modifications',
        'Locks auto-expire - no manual unlock needed',
        'Use appropriate lock_duration for operation complexity'
      ],
      layer_assignment: [
        'presentation: UI components, API controllers',
        'business: Services, domain logic',
        'data: Models, repositories, migrations',
        'infrastructure: Config, deployment, CI/CD',
        'cross-cutting: Utilities used across layers'
      ]
    }
  };
}
