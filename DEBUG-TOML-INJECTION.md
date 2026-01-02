# DEBUG: Plan TOML Template Injection Issue

## Problem Summary

v4.2.0のPlan TOML Template機能で、`[[constraint]]`ブロックがプランファイルに注入されない問題。

### 症状

- Planエージェント起動時にTOMLテンプレートがプロンプトに注入されるはずが、されていない
- 結果としてConstraintがプランに記載されず、自動登録もされない

## Key Files to Investigate

### Hook Files (mcp-sqlew)

```
src/cli/hooks/suggest.ts          # PreToolUse hook - TOML template injection
src/cli/hooks/stdin-parser.ts     # isPlanAgent() function (line 281)
src/cli/hooks/track-plan.ts       # TOML parsing on plan write
src/cli/hooks/on-subagent-stop.ts # Post-completion processing
```

### Key Functions

- `isPlanAgent(input)` - Checks if `subagent_type === 'Plan'`
- `sendUpdatedInput()` - Modifies Task tool's prompt to include TOML template
- `PLAN_TOML_TEMPLATE` constant in suggest.ts (lines 24-52)

## Debug Log Paths (test3 Project)

### Chat Logs

```
C:/Users/kitayama/.claude/projects/C--Users-kitayama-RustroverProjects-test3/

Sessions investigated:
- 66168bf5-2ff7-493b-be8c-0c699af5694b.jsonl  # Main session (11:07Z-11:21Z)
- 8ab6b36a-c61d-42fc-978d-6476534f6aba.jsonl  # 11:50Z
- 8f59d398-761a-4198-b899-7c4ee8b990b7.jsonl  # 11:51Z
- f2f3dcf7-9a46-4df0-bdd6-03aaf79a3b93.jsonl  # 12:01Z
```

### MCP Logs

```
C:/Users/kitayama/AppData/Local/claude-cli-nodejs/Cache/C--Users-kitayama-RustroverProjects-test3/mcp-logs-sqlew/

Files:
- 2025-12-27T11-51-21-793Z.jsonl
```

### Plan Files

```
C:/Users/kitayama/.claude/plans/
- abstract-tinkering-volcano.md   # No [[constraint]] blocks found
- federated-singing-unicorn.md    # No [[constraint]] blocks found
```

### Queue File

```
C:/Users/kitayama/RustroverProjects/test3/.sqlew/queue/pending.json
# Currently empty: {"items": []}
```

### Session Debug Log

```
C:\Users\kitayama\.claude\debug
```

## Timeline from Session 66168bf5

```
11:10:23 - constraint.get → count: 0 (no constraints initially)
11:17:51 - constraint.add FAILED (used "text" instead of "constraint_text")
11:17:57 - constraint.add FAILED (invalid layer: "application")
11:18:03 - constraint.add SUCCESS → constraint_id: 1
11:18:07 - constraint.get → count: 1 (confirmed)
11:20:44 - User: "Decisions、Constraintsをカラにして"
11:20:56 - constraint.deactivate SUCCESS
11:21:01 - constraint.get → count: 0 (after deactivation)
```

## Reproduction Test Steps

### Test 1: Verify Hook Registration

```bash
# In test3 project, check .claude/settings.local.json for hook config
cat C:/Users/kitayama/RustroverProjects/test3/.claude/settings.local.json
```

### Test 2: Plan Agent TOML Injection

1. Open Claude Code in test3 project
2. Enter plan mode: Ask Claude to plan a simple task
3. Check if the plan file contains TOML template section:
    - Look for "## Architectural Decisions & Constraints"
    - Look for `[[decision]]` and `[[constraint]]` examples

### Test 3: Manual Hook Test

```bash
# Test suggest hook directly
echo '{"tool_name": "Task", "tool_input": {"subagent_type": "Plan", "prompt": "test"}}' | npx sqlew suggest
```

### Test 4: Check Hook Output Format

The suggest hook should output JSON with `updatedInput`:

```json
{
    "continue": true,
    "updatedInput": {
        "prompt": "original prompt\n\n---\n\n## Architectural Decisions & Constraints\n..."
    }
}
```

## Useful jq Commands

```bash
# Search for constraint operations in chat log
jq -c 'select(.message.content[]?.name == "mcp__sqlew__constraint")' <file.jsonl>

# Search for Task tool calls
jq -c 'select(.message.content[]?.name == "Task")' <file.jsonl>

# Find Plan agent invocations
rg "subagent_type.*Plan" <file.jsonl>
```

## Expected Behavior

1. User enters plan mode or asks Claude to plan something
2. Claude invokes `Task` tool with `subagent_type: "Plan"`
3. `suggest` hook intercepts this call (PreToolUse)
4. Hook checks `isPlanAgent()` → returns true
5. Hook calls `sendUpdatedInput()` with enriched prompt containing TOML template
6. Plan agent receives the enriched prompt
7. Plan agent writes plan file with TOML blocks for decisions/constraints
8. `track-plan` hook parses TOML blocks and caches them
9. On task completion, decisions are queued and constraints prompt for registration

## Questions to Answer

1. Is the `suggest` hook being called at all when Plan agent starts?
2. Is `isPlanAgent()` returning true correctly?
3. Is `sendUpdatedInput()` format correct for Claude Code?
4. Does the Plan agent actually receive the enriched prompt?

---

## Investigation Results (2025-12-27)

### Root Cause #1: Native Plan Mode doesn't use Task(Plan) agent

**セッションログ分析結果:**

- Claude CodeのネイティブPlan Modeでは `EnterPlanMode` → `Write` → `ExitPlanMode` の流れ
- **Task tool (subagent_type='Plan') は使われない！**
- そのため `suggest` hook がトリガーされず、TOMLテンプレートが注入されない

**Evidence from session 66168bf5:**

```
11:08:08 - User requests plan
11:08:10 - Claude uses Bash (ls -la) to check project
11:08:27 - Claude uses Write to create plan file directly
11:08:37 - Claude uses ExitPlanMode
```

→ Task tool は一度も使われていない

### Root Cause #2: PostToolUse hook output format is wrong

**現在の stdin-parser.ts sendContinue():**

```typescript
const output: HookOutput = { continue: true };
if (additionalContext) {
    output.additionalContext = additionalContext; // ← WRONG!
}
```

**出力:**

```json
{ "continue": true, "additionalContext": "..." }
```

**Claude Code が期待する形式:**

```json
{
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": "..."
    }
}
```

トップレベルの `additionalContext` は**無視される**！

### Root Cause #3: on-exit-plan timing is too late

- `on-exit-plan` は PostToolUse for ExitPlanMode
- プラン作成後に「TOMLを追加して」と言っても遅い
- プラン作成前（EnterPlanMode PreToolUse）でテンプレートを注入すべき

### Proposed Fixes

1. **Add EnterPlanMode PreToolUse hook** - プランモード開始時にTOMLテンプレートを注入
2. **Fix hookSpecificOutput format** - PostToolUse の出力形式を修正
3. **Consider: Modify Write hook for plan files** - プランファイル書き込み時にテンプレートを content に追加

### Files to Modify

- `src/cli/hooks/stdin-parser.ts` - sendContinue() の出力形式を修正
- `src/cli/hooks/suggest.ts` - EnterPlanMode 対応を追加（または新規hook作成）
- `src/cli/hooks/init-hooks.ts` - EnterPlanMode PreToolUse hook を追加
