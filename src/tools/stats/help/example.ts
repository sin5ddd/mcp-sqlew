/**
 * Example action for stats tool
 */

export function statsExample(): any {
  return {
    tool: 'stats',
    description: 'Database statistics and maintenance examples',
    scenarios: {
      layer_analysis: {
        title: 'Architecture Layer Summary',
        example: {
          request: '{ action: "layer_summary" }',
          response_structure: '{ layer: string, decision_count: number, file_changes: number, active_constraints: number }[]',
          use_case: 'Understand which layers have most activity and decisions'
        }
      },
      database_health: {
        title: 'Database Statistics',
        example: {
          request: '{ action: "db_stats" }',
          response_structure: '{ decisions: N, file_changes: N, constraints: N, tasks: N, db_size_mb: N }',
          use_case: 'Monitor database growth and table sizes'
        }
      },
      activity_monitoring: {
        title: 'Activity Log Queries',
        examples: [
          {
            scenario: 'Recent activity (last hour)',
            request: '{ action: "activity_log", since: "1h", limit: 50 }',
            explanation: 'View all agent activity in the past hour'
          },
          {
            scenario: 'Specific agent activity',
            request: '{ action: "activity_log", since: "24h", agent_names: ["backend-agent", "frontend-agent"] }',
            explanation: 'Track what specific agents have been doing'
          },
          {
            scenario: 'Filter by action type',
            request: '{ action: "activity_log", since: "2d", actions: ["set_decision", "create_task"] }',
            explanation: 'See only specific types of actions'
          }
        ]
      },
      data_cleanup: {
        title: 'Maintenance and Cleanup',
        examples: [
          {
            scenario: 'Manual cleanup with specific retention',
            request: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
            explanation: 'Override config and delete old data'
          },
          {
            scenario: 'Config-based automatic cleanup',
            request: '{ action: "clear" }',
            explanation: 'Use configured retention settings (respects weekend-aware mode)'
          }
        ]
      },
      wal_management: {
        title: 'WAL Checkpoint (Git Workflow)',
        workflow: [
          {
            step: 1,
            action: 'Make changes to context (decisions, tasks, etc.)',
            explanation: 'SQLite WAL mode keeps changes in separate file'
          },
          {
            step: 2,
            action: 'Before git commit, flush WAL',
            request: '{ action: "flush" }',
            explanation: 'Merges WAL changes into main .db file'
          },
          {
            step: 3,
            action: 'Commit database file',
            explanation: 'Database file now contains all changes for version control'
          }
        ]
      }
    },
    best_practices: {
      monitoring: [
        'Check layer_summary regularly to identify hotspots',
        'Monitor db_stats to prevent database bloat',
        'Use activity_log for debugging multi-agent issues',
        'Set appropriate retention periods based on project needs'
      ],
      cleanup: [
        'Run periodic cleanup to manage database size',
        'Use weekend-aware mode for business hour retention',
        'Consider longer retention for important decisions',
        'Test cleanup with manual parameters before automating'
      ],
      wal_checkpoints: [
        'Always flush before git commits for clean diffs',
        'WAL mode improves concurrent access performance',
        'Checkpoint automatically happens on shutdown',
        'Manual flush ensures immediate persistence'
      ]
    }
  };
}
