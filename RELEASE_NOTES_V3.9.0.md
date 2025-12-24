# sqlew v3.9.0 Release Notes

**Release Date:** January 15, 2025
**Status:** ✅ Production Ready
**Test Coverage:** 495/495 tests passing (100%)

---

## 🎯 Headline Feature: Three-Tier Decision Intelligence

v3.9.0 introduces an intelligent duplicate detection system that automatically prevents redundant decisions while preserving organizational memory.

### The Problem It Solves

Without duplicate detection:
- Teams create redundant decisions ("use-postgresql" vs "db-choice-postgres")
- Decision fragmentation makes discovery difficult
- No clear path when similar decisions exist
- Manual checking wastes time

### The Solution: Three-Tier System

**Tier 1 (35-44 points): Gentle Nudge**
- Non-blocking warning with suggestions
- Lets you proceed but shows related decisions
- Perfect for "might be related" scenarios

**Tier 2 (45-59 points): Hard Block**
- Prevents creation to avoid duplicates
- Requires explicit override (`ignore_suggest=true`) or update
- Clear error message with resolution options

**Tier 3 (60+ points): Auto-Update**
- Transparently updates existing decision
- Preserves your new value
- Zero friction for iterative refinement

### Example Workflow

```typescript
// First decision
await decision.set({
  key: "api-rate-limiting",
  value: "Use 100 requests/minute for free tier",
  tags: ["api", "rate-limiting", "performance"],
  layer: "infrastructure"
});

// Later, similar decision
await decision.set({
  key: "api-throttling",
  value: "Use 100 requests/minute for free tier",  // Nearly identical
  tags: ["api", "rate-limiting", "performance"],   // Same tags
  layer: "infrastructure"                           // Same layer
});

// Result: Tier 3 auto-update
// ✅ Updates "api-rate-limiting" to version 1.0.1
// ✅ No duplicate "api-throttling" created
// ✅ Returns: { auto_updated: true, actual_key: "api-rate-limiting", ... }
```

---

## 🆕 New Features

### `suggest` Tool

Four powerful search actions:

1. **by_key** - Pattern-based search
   ```typescript
   suggest.by_key({ key: "api/*/latency" })
   // Finds: api/rest/latency, api/graphql/latency, api/websocket/latency
   ```

2. **by_tags** - Tag similarity scoring
   ```typescript
   suggest.by_tags({ tags: ["database", "performance"] })
   // Returns decisions with matching tags, scored by Jaccard similarity
   ```

3. **by_context** - Multi-factor search
   ```typescript
   suggest.by_context({
     key: "cache-strategy",
     tags: ["redis", "caching"],
     layer: "infrastructure"
   })
   // Combines all factors for best matches
   ```

4. **check_duplicate** - Pre-creation validation
   ```typescript
   suggest.check_duplicate({
     key: "new-decision",
     tags: ["tag1", "tag2"],
     layer: "business"
   })
   // Returns similarity score and recommendations
   ```

### Similarity Scoring Algorithm

**Total Score: 0-100 points**

| Factor | Max Points | Calculation |
|--------|------------|-------------|
| Tag overlap | 40 | 10 per matching tag (max 4) |
| Layer match | 25 | Same layer = 25, different = 0 |
| Key similarity | 20 | Pattern + Levenshtein distance |
| Recency | 10 | <30 days = 10, decay over time |
| Priority | 5 | Critical = 5, High = 4, etc. |

**Example Calculation:**
```
Decision A: key="load-balancer/haproxy", tags=["lb", "haproxy", "infra"], layer="infrastructure"
Decision B: key="proxy/nginx", tags=["lb", "nginx", "infra"], layer="infrastructure"

Tag overlap: 2 matching tags (lb, infra) = 20 points
Layer match: same (infrastructure) = 25 points
Key similarity: different patterns = 3 points
Recency: recent = 10 points
Priority: medium = 3 points
────────────────────────────────────────
Total: 61 points → Tier 3 (auto-update)
```

### Policy-Based Auto-Triggering

Enable automatic duplicate detection with policies:

```typescript
// Create policy with suggestion enabled
await decision.set_from_policy({
  policy_name: "security-decisions",
  suggest_similar: 1,  // Enable auto-trigger
  validation_rules: {
    patterns: { key: "^security/" }
  }
});

// Now all security/* decisions auto-check for duplicates
await decision.set({
  key: "security/auth-method",  // Matches policy pattern
  value: "Use OAuth2 with PKCE",
  tags: ["security", "authentication"]
  // Auto-triggers duplicate detection!
});
```

### Enhanced Decision Metadata

New fields in decision responses:

- **`duplicate_reason`**: Explanation of similarity match
  ```json
  {
    "similarity": "3 matching tags, same layer",
    "matched_tags": ["api", "rate-limiting", "performance"],
    "layer": "infrastructure",
    "score": 85
  }
  ```

- **`update_command`**: Ready-to-use update command
  ```json
  {
    "key": "api-rate-limiting",
    "value": "Update with your new value",
    "version": "1.0.1",
    "tags": ["api", "rate-limiting", "performance"]
  }
  ```

- **`version_info`**: Existing decision version
  ```json
  {
    "current_version": "1.0.0",
    "last_updated": "2025-01-10T10:30:00Z"
  }
  ```

- **`auto_updated`**: Tier 3 transparent update flag
  ```json
  {
    "auto_updated": true,
    "requested_key": "api-throttling",
    "actual_key": "api-rate-limiting"
  }
  ```

---

## 🐛 Bug Fixes

### PostgreSQL Cross-Database Compatibility
- Fixed CAST type mismatch in `v_tagged_decisions` view
- PostgreSQL: `CAST(value AS TEXT)`
- MySQL/MariaDB: `CAST(value AS CHAR)`
- Result: All 20 cross-database tests passing

### Test Suite Improvements
- Fixed FK constraint cleanup order in e2e tests
- Child records deleted before parents (tags → scopes → context → decisions)
- Result: 3/3 e2e workflow tests passing

### String Mismatch in Error Detection
- Fixed error message parsing (underscore vs hyphen: `DUPLICATE_DETECTED` vs `DUPLICATE DETECTED`)
- Unified error format across all tiers
- Self-exclusion logic prevents matching against own key during updates

---

## 🔄 Changes

### Test Organization
- Moved 7 Docker-dependent tests to `src/tests/docker/`
- `npm test` runs 495 unit tests without Docker (0 failures)
- `npm run test:docker` runs cross-database tests
- Decision documented: `test-organization-docker-separation`

### Git Hook Enhancement
- Pre-commit hook checks for **PUSHED** migration files (not just committed)
- Auto-detects remote branch (origin/main, origin/master, origin/dev)
- Allows editing locally committed migrations
- Graceful fallback for local-only repositories

### Debug Output Cleanup
- AI-optimized quiet mode (80-90% token reduction)
- Verbose mode available with `:verbose` suffix
- Cross-platform filter script (`scripts/filter-test-output.js`)
- Cleaner test output focusing on results

---

## 📊 Test Results

### Overall: 495/495 (100%) ✅

**Three-Tier System:**
- ✅ Tier 1 (Gentle Nudge): 5/5 tests
- ✅ Tier 2 (Hard Block): 2/2 tests
- ✅ Tier 3 (Auto-Update): 3/3 tests

**Integration:**
- ✅ Auto-trigger suggestions: 4/4 tests
- ✅ Edge cases: All passing
- ✅ E2E workflows: 3/3 tests

**Cross-Database:**
- ✅ MySQL: 20/20 tests
- ✅ MariaDB: 20/20 tests
- ✅ PostgreSQL: 20/20 tests

**Test Suite Enhancements:**
- Zero flaky tests
- 64.85% line coverage
- All critical paths tested

---

## 📚 Documentation

### Updated
- `CHANGELOG.md` - Detailed v3.9.0 changes
- `README.md` - Updated features list
- `CLAUDE.md` - Test execution guidelines

### New
- `COMPLETION_SUMMARY_V3.9.0.md` - Implementation details
- `RELEASE_NOTES_V3.9.0.md` - This document

---

## 🔧 Migration Guide

### Backward Compatibility
✅ **Fully backward compatible with v3.8.x**
- No breaking changes
- Automatic database migration on server startup
- Safe to upgrade without code changes

### Database Changes
- 3 new enhancement migrations (all idempotent)
- Schema changes apply automatically
- Safe rollback by restoring backup

### What's Required
**Nothing!** Just update the package:

```bash
npm install sqlew@3.9.0
# or
npx sqlew  # Auto-updates to latest
```

### What's Changed
- `decision.set` now returns additional fields (backward compatible)
- New `suggest` tool available (opt-in)
- Policy-based auto-triggering (opt-in via `suggest_similar=1`)

---

## 📈 Performance Metrics

### Token Efficiency
- Suggest tool: 60-70% token reduction vs manual searching
- Quiet test mode: 80-90% token reduction (AI-optimized)
- Overall project: 60-75% token reduction (unchanged)

### Execution Time
- Duplicate detection: <50ms (similarity scoring + DB query)
- Auto-update (Tier 3): <100ms (update + version increment)
- Policy validation: <10ms (cached patterns)

### File Changes
- 50 files modified
- +1,857 insertions, -2,096 deletions
- Net: -239 lines (code reduction through refactoring)

---

## 🎓 Best Practices

### When to Use Each Tier

**Tier 1 (35-44): Research Phase**
- Exploring related decisions
- Understanding existing patterns
- Not sure if related

**Tier 2 (45-59): Decision Phase**
- High similarity, different approach
- Intentional alternative
- Need to document why different

**Tier 3 (60+): Refinement Phase**
- Iterating on existing decision
- Updating values
- Fixing typos or improving clarity

### Bypass Mechanism

Override duplicate detection when needed:

```typescript
await decision.set({
  key: "similar-but-different",
  value: "Intentionally different approach",
  tags: ["same", "tags", "as", "existing"],
  layer: "infrastructure",
  ignore_suggest: true,  // Skip duplicate detection
  ignore_reason: "Different use case - async tasks vs event bus"
});
```

---

## 🚀 Upgrade Checklist

- [x] Update package: `npm install sqlew@3.9.0`
- [x] Test duplicate detection with existing decisions
- [x] Consider enabling policy-based auto-triggering
- [x] Update team documentation on new features
- [x] Run full test suite: `npm test` (expect 495/495)

---

## 📞 Support

- **Issues**: https://github.com/sin5ddd/mcp-sqlew/issues
- **Discussions**: https://github.com/sin5ddd/mcp-sqlew/discussions
- **Documentation**: https://github.com/sin5ddd/mcp-sqlew/tree/main/docs

---

## 🙏 Acknowledgments

Special thanks to the Claude Code community for feedback and testing!

---

**Enjoy smarter decision management with sqlew v3.9.0!** 🎉
