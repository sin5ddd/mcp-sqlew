/**
 * Suggest Tool - Help Documentation
 */

export function getSuggestHelp(): any {
  return {
    tool: 'suggest',
    description: 'Intelligent decision/constraint suggestion system',
    actions: [
      {
        action: 'by_key',
        description: 'Find similar decisions by key pattern',
        params: {
          key: 'Required: Decision key to match against',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
      },
      {
        action: 'by_tags',
        description: 'Find decisions by tag overlap (fast)',
        params: {
          tags: 'Required: Array of tags to match',
          layer: 'Optional: Filter by layer',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
      },
      {
        action: 'by_context',
        description: 'Hybrid scoring with key, tags, layer, priority',
        params: {
          key: 'Required: Decision key',
          tags: 'Optional: Array of tags',
          layer: 'Optional: Layer name',
          priority: 'Optional: Priority level',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
      },
      {
        action: 'check_duplicate',
        description: 'Check if key already exists or is very similar',
        params: {
          key: 'Required: Decision key to check',
        },
      },
    ],
  };
}
