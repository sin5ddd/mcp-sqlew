/**
 * Constraint Suggest - Help Documentation
 *
 * Provides documentation for the Constraint Intelligence System.
 * Use target: "constraint" with the suggest tool to access these actions.
 */

/**
 * Get help documentation for constraint suggest actions
 * @returns Help documentation object for constraint suggestions
 */
export function getConstraintSuggestHelp(): any {
  return {
    tool: 'suggest',
    target: 'constraint',
    description: 'Intelligent constraint suggestion system for duplicate detection and related constraint discovery',
    note: 'Use target: "constraint" to access these actions. Default target is "decision".',
    scoring: {
      description: 'Constraints are scored on a 100-point scale',
      breakdown: {
        tag_overlap: '40 points max (10 per matching tag, max 4 tags)',
        layer_match: '25 points (exact layer match)',
        text_similarity: '20 points (Levenshtein distance)',
        recency: '10 points (recently updated constraints score higher)',
        priority: '5 points (higher priority constraints score higher)',
      },
      thresholds: {
        default_min_score: 30,
        duplicate_threshold: 70,
        recency_tiers: {
          '30_days': '10 points',
          '90_days': '5 points',
          '180_days': '2 points',
          'older': '0 points',
        },
        priority_scores: {
          critical_4: '5 points',
          high_3: '4 points',
          medium_2: '3 points',
          low_1: '2 points',
        },
      },
    },
    actions: [
      {
        action: 'by_key',
        description: 'Find similar constraints by text pattern (alias for by_context with text only)',
        params: {
          text: 'Required: Constraint text to match against',
          layer: 'Optional: Filter by layer (e.g., "data", "business")',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
        note: 'For constraints, by_key uses text similarity via Levenshtein distance',
      },
      {
        action: 'by_tags',
        description: 'Find constraints by tag overlap (fast)',
        params: {
          tags: 'Required: Array of tags to match (e.g., ["api", "performance"])',
          layer: 'Optional: Filter by layer',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
        note: 'Only returns constraints with at least one matching tag',
      },
      {
        action: 'by_context',
        description: 'Hybrid scoring with text, tags, layer, and priority',
        params: {
          text: 'Optional: Constraint text for similarity matching',
          constraint_text: 'Optional: Alias for text parameter',
          tags: 'Optional: Array of tags to match',
          layer: 'Optional: Layer name for filtering and scoring',
          priority: 'Optional: Priority level (1-4) for scoring',
          limit: 'Optional: Max suggestions (default: 5)',
          min_score: 'Optional: Minimum relevance score (default: 30)',
        },
        note: 'At least one of text, tags, or layer must be provided',
      },
      {
        action: 'check_duplicate',
        description: 'Two-phase duplicate detection for constraints',
        params: {
          text: 'Required: Constraint text to check',
          constraint_text: 'Optional: Alias for text parameter',
          category: 'Optional: Category to check within (e.g., "performance")',
        },
        response: {
          is_duplicate: 'Boolean: true if exact match found',
          match_type: '"exact" | "similar" | "none"',
          existing: 'Existing constraint object (if exact match)',
          similar_constraints: 'Array of similar constraints (if similar match)',
          score: 'Similarity score of top match',
          recommendation: 'Human-readable recommendation',
        },
        note: 'Phase 1: Exact match. Phase 2: Similarity check with threshold 70.',
      },
    ],
    examples: {
      by_key:
        '{ action: "by_key", target: "constraint", text: "API response time", limit: 5 }',
      by_tags:
        '{ action: "by_tags", target: "constraint", tags: ["api", "performance"], layer: "business" }',
      by_context:
        '{ action: "by_context", target: "constraint", text: "database query", tags: ["sql"], layer: "data", priority: 3 }',
      check_duplicate:
        '{ action: "check_duplicate", target: "constraint", text: "API response time must be under 100ms" }',
    },
    workflow: {
      before_creating_constraint: [
        '1. Call check_duplicate with constraint text',
        '2. If is_duplicate=true, consider updating existing constraint',
        '3. If match_type="similar", review similar_constraints before creating',
        '4. If match_type="none", safe to create new constraint',
      ],
      finding_related_constraints: [
        '1. Use by_tags for fast tag-based discovery',
        '2. Use by_context for comprehensive hybrid search',
        '3. Review score_breakdown to understand relevance',
      ],
    },
    documentation: {
      constraint_tool: 'constraint action: "help" - Main constraint management',
      decision_suggest: 'suggest action: "help" - Decision suggestion system',
    },
  };
}
