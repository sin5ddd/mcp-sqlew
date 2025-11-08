/**
 * Help action for stats tool
 */

export function statsHelp(): any {
  return {
    tool: 'stats',
    description: 'View database statistics, activity logs, manage data cleanup, and WAL checkpoints',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all stats actions.',
    actions: {
      layer_summary: 'Get summary by layer. No params required',
      db_stats: 'Get database statistics. No params required',
      clear: 'Clear old data. Params: messages_older_than_hours, file_changes_older_than_days',
      activity_log: 'Get activity log (v3.0.0). Params: since (e.g., "5m", "1h", "2d"), agent_names (array or ["*"]), actions (filter by action types), limit (default: 100)',
      flush: 'Force WAL checkpoint to flush pending transactions to main database file. No params required. Uses TRUNCATE mode for complete flush. Useful before git commits to ensure database file is up-to-date.'
    },
    examples: {
      layer_summary: '{ action: "layer_summary" }',
      db_stats: '{ action: "db_stats" }',
      clear: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
      activity_log: '{ action: "activity_log", since: "1h", agent_names: ["bot1", "bot2"], limit: 50 }',
      flush: '{ action: "flush" }'
    },
    documentation: {
      workflows: 'docs/WORKFLOWS.md - Activity monitoring, automatic cleanup workflows (602 lines, ~30k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - Database health, cleanup strategies (345 lines, ~17k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions for layer_summary (339 lines, ~17k tokens)',
      architecture: 'docs/ARCHITECTURE.md - Database schema, views, statistics tables'
    }
  };
}
