# Constraint Intelligence System (v4.0.0)

**Status:** Production Ready
**Release Date:** 2025-11-27

---

## Overview

The Constraint Intelligence System provides duplicate detection and similarity-based suggestions for architectural constraints. It complements the [Decision Intelligence System](DECISION_INTELLIGENCE.md) with constraint-specific scoring and workflows.

### Key Features

- **Duplicate Detection**: Two-phase check (exact match, then similarity)
- **Hybrid Scoring**: Combines text, tags, layer, recency, and priority
- **Constraint-Specific Scoring**: Optimized for rule-based content
- **Pre-Creation Validation**: Check before adding new constraints

---

## Accessing Constraint Suggestions

Use `target: "constraint"` with the suggest tool:

```javascript
// Default is target: "decision"
suggest({
  action: "by_tags",
  target: "constraint",  // Required for constraint suggestions
  tags: ["api", "performance"]
})
```

---

## Scoring Algorithm

### Components (100 points max)

| Component | Max Points | Description |
|-----------|-----------|-------------|
| Tag overlap | 40 | 10 per matching tag (max 4 tags) |
| Layer match | 25 | Exact layer match |
| Text similarity | 20 | Levenshtein distance calculation |
| Recency | 10 | Recently updated constraints score higher |
| Priority | 5 | Higher priority constraints score higher |

### Recency Tiers

| Age | Points |
|-----|--------|
| < 30 days | 10 |
| 30-90 days | 5 |
| 90-180 days | 2 |
| > 180 days | 0 |

### Priority Scores

| Priority | Level | Points |
|----------|-------|--------|
| 4 | Critical | 5 |
| 3 | High | 4 |
| 2 | Medium | 3 |
| 1 | Low | 2 |

### Thresholds

| Threshold | Value | Description |
|-----------|-------|-------------|
| Default min_score | 30 | Minimum score for suggestions |
| Duplicate threshold | 70 | Score triggering duplicate warning |

---

## Actions

### by_key - Text Pattern Search

Find similar constraints by text pattern (alias for by_context with text only).

```javascript
suggest({
  action: "by_key",
  target: "constraint",
  text: "API response time",      // Required: text to match
  layer: "business",              // Optional: filter by layer
  limit: 5,                       // Optional: max results (default: 5)
  min_score: 30                   // Optional: minimum score (default: 30)
})
```

### by_tags - Tag-Based Discovery

Find constraints by tag overlap (fast).

```javascript
suggest({
  action: "by_tags",
  target: "constraint",
  tags: ["api", "performance"],   // Required: tags to match
  layer: "business",              // Optional: filter by layer
  limit: 5,                       // Optional
  min_score: 30                   // Optional
})
```

### by_context - Hybrid Search

Comprehensive search combining text, tags, layer, and priority.

```javascript
suggest({
  action: "by_context",
  target: "constraint",
  text: "database query",         // Optional
  tags: ["sql"],                  // Optional
  layer: "data",                  // Optional (also used for scoring)
  priority: 3,                    // Optional (for scoring)
  limit: 5,                       // Optional
  min_score: 30                   // Optional
})

// Note: At least one of text, tags, or layer required
```

### check_duplicate - Pre-Creation Check

Two-phase duplicate detection before creating constraints.

```javascript
suggest({
  action: "check_duplicate",
  target: "constraint",
  text: "API response time must be under 100ms",  // Required
  category: "performance"                          // Optional: filter by category
})

// Response:
{
  is_duplicate: false,
  match_type: "similar",        // "exact" | "similar" | "none"
  existing: null,               // Existing constraint (if exact)
  similar_constraints: [...],   // Array of similar constraints
  score: 65,                    // Similarity score of top match
  recommendation: "Similar constraint found..."
}
```

---

## Workflows

### Before Creating a Constraint

```javascript
// Step 1: Check for duplicates
const result = await suggest({
  action: "check_duplicate",
  target: "constraint",
  text: "API response time must be under 100ms"
});

// Step 2: Handle result
if (result.is_duplicate) {
  // Exact match exists - update instead
  console.log("Constraint exists:", result.existing);
} else if (result.match_type === "similar") {
  // Review similar constraints
  console.log("Similar constraints:", result.similar_constraints);
  // Decide: create new or update existing
} else {
  // Safe to create new constraint
  constraint({ action: "add", ... });
}
```

### Finding Related Constraints

```javascript
// Fast: Tag-based discovery
const byTags = await suggest({
  action: "by_tags",
  target: "constraint",
  tags: ["security", "authentication"]
});

// Comprehensive: Hybrid search
const byContext = await suggest({
  action: "by_context",
  target: "constraint",
  text: "password policy",
  tags: ["security"],
  layer: "business"
});

// Review score_breakdown to understand relevance
byContext.suggestions.forEach(s => {
  console.log(s.constraint_text, s.score_breakdown);
});
```

---

## Response Structure

### Suggestion Object

```typescript
{
  id: number,                    // Constraint ID
  constraint_text: string,       // Full constraint text
  category: string,              // Constraint category
  score: number,                 // Total relevance score (0-100)
  reason: string,                // Human-readable explanation
  score_breakdown: {
    tag_overlap: number,
    layer_match: number,
    text_similarity: number,
    recency: number,
    priority: number
  },
  layer?: string,                // Assigned layer
  tags?: string[],               // Associated tags
  ts?: number                    // Last updated timestamp
}
```

---

## Comparison: Decision vs Constraint Intelligence

| Feature | Decision Intelligence | Constraint Intelligence |
|---------|----------------------|------------------------|
| Target | `"decision"` (default) | `"constraint"` |
| Scoring max | 100 points | 100 points |
| Key/Text weight | 40 points | 20 points |
| Tag weight | 30 points | 40 points |
| Layer weight | 15 points | 25 points |
| Recency | - | 10 points |
| Priority | - | 5 points |
| Auto-update tier | Yes (60+) | No |
| Hard block tier | Yes (45-59) | No |
| Duplicate threshold | 60+ auto-update | 70 warning |

### Why Different Scoring?

**Decisions** focus on key patterns and value similarity (choices already made).

**Constraints** focus on tag overlap and layer match (rules that must be enforced).

---

## Best Practices

### 1. Use Consistent Tags

```javascript
// Good: Consistent taxonomy
tags: ["api", "performance", "latency"]

// Avoid: Inconsistent naming
tags: ["API", "perf", "response-time"]
```

### 2. Check Before Creating

```javascript
// Always check for duplicates
suggest({
  action: "check_duplicate",
  target: "constraint",
  text: "Your constraint text"
})
```

### 3. Use by_tags for Discovery

```javascript
// Fast discovery of related constraints
suggest({
  action: "by_tags",
  target: "constraint",
  tags: ["security"]
})
```

### 4. Review score_breakdown

```javascript
// Understand why a constraint was suggested
suggestions.forEach(s => {
  if (s.score_breakdown.tag_overlap > 30) {
    // High tag overlap - likely related
  }
  if (s.score_breakdown.layer_match === 25) {
    // Same layer - consider consolidation
  }
});
```

---

## Configuration

**File:** `src/constants.ts`

```typescript
// Constraint suggestion defaults
export const CONSTRAINT_SUGGEST_DEFAULTS = {
  MIN_SCORE: 30,
  LIMIT: 5,
  DUPLICATE_THRESHOLD: 70,
} as const;

// Score weights
export const CONSTRAINT_SCORE_WEIGHTS = {
  TAG_OVERLAP: 10,      // Per matching tag (max 40)
  LAYER_MATCH: 25,      // Exact match
  TEXT_SIMILARITY: 20,  // Max based on Levenshtein
  RECENCY_MAX: 10,      // Based on age tiers
  PRIORITY_MAX: 5,      // Based on priority level
} as const;
```

---

## Related Documentation

| Document | Content |
|----------|---------|
| [DECISION_INTELLIGENCE.md](DECISION_INTELLIGENCE.md) | Decision duplicate detection |
| [TOOL_REFERENCE.md](TOOL_REFERENCE.md) | Complete parameter reference |
| [SHARED_CONCEPTS.md](SHARED_CONCEPTS.md) | Layers, priorities, tags |
| [TOOL_SELECTION.md](TOOL_SELECTION.md) | Constraint vs Decision selection |

---

**Version:** 4.0.0
**Last Updated:** 2025-11-27
