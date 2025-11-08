/**
 * Help action for file tool
 */

export function fileHelp(): any {
  return {
    tool: 'file',
    description: 'Track file changes across agents with layer classification',
    note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all file tracking actions.',
    actions: {
      record: 'Record file change. Params: file_path (required), agent_name (required), change_type (required), layer, description',
      get: 'Get file changes. Params: file_path, agent_name, layer, change_type, since, limit',
      check_lock: 'Check if file locked. Params: file_path (required), lock_duration',
      record_batch: 'Batch record file changes (FR-005). Params: file_changes (required, array of RecordFileChangeParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE (atomic: true): All file changes succeed or all fail as a single transaction. IF ANY record fails, entire batch is rolled back and error is thrown. NON-ATOMIC MODE (atomic: false): Each file change is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default for best-effort recording. Use atomic:true only when all-or-nothing guarantee is required. 52% token reduction vs individual calls.'
    },
    examples: {
      record: '{ action: "record", file_path: "src/index.ts", agent_name: "refactor-bot", change_type: "modified", layer: "infrastructure" }',
      get: '{ action: "get", agent_name: "refactor-bot", layer: "infrastructure", limit: 10 }',
      check_lock: '{ action: "check_lock", file_path: "src/index.ts", lock_duration: 300 }',
      record_batch: '{ action: "record_batch", file_changes: [{"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}, {"file_path": "src/index.ts", "agent_name": "bot1", "change_type": "modified", "layer": "infrastructure"}], atomic: true }'
    },
    documentation: {
      workflows: 'docs/WORKFLOWS.md - File locking patterns, concurrent file access workflows (602 lines, ~30k tokens)',
      tool_reference: 'docs/TOOL_REFERENCE.md - File tool parameters, batch operations (471 lines, ~24k tokens)',
      shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (change_type), atomic mode (339 lines, ~17k tokens)',
      best_practices: 'docs/BEST_PRACTICES.md - File tracking best practices (345 lines, ~17k tokens)'
    }
  };
}
