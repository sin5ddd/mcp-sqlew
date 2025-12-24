# sqlew Hooks Integration テスト指示書

## 背景

`mcp-sqlew` v4.1.0でClaude Code Hooks統合機能を実装しました。以下のテストを実施して結果を報告してください。

## テスト環境

- このディレクトリは `mcp-sqlew` のgit worktreeです
- 本体リポジトリ: `C:\Users\kitayama\RustroverProjects\mcp-sqlew`

## 変更点（v4.1.0）

### Config優先順位（高→低）

1. **本体リポconfig**（worktree親の`.sqlew/config.toml`）
2. **ローカルconfig**（`.sqlew/config.toml`）
3. **グローバルconfig**（`~/.config/sqlew/config.toml` または `%APPDATA%/sqlew/config.toml`）
4. **デフォルト動作**

### .sqlew/ディレクトリ作成条件

- MySQL/PostgreSQL指定時は**作成しない**
- worktree親やglobalのconfigを使う場合も**作成しない**
- ローカルconfigまたはデフォルト動作の場合のみ作成

### Hooks自動初期化

- MCP起動時に自動でHooks設定（初回のみ）
- 設定ファイル: `.claude/settings.local.json`（gitignore対象）
- 手動コマンド: `sqlew init --hooks` も引き続き使用可能

## テスト手順

### 0. .mcp.json設定

```
{
  "mcpServers": {
    "sqlew": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "."
    }
  }
}
```

### 1. ビルド確認

```bash
npm install; npm run build; claude
```

### 2. Worktree Config優先順位テスト

このworktreeには`.sqlew/config.toml`がないはずなので、本体リポのconfigが使われるはず。

```bash
# MCP Inspectorで起動
npx @modelcontextprotocol/inspector node dist/index.js

# デバッグログを確認（configSourceが'worktree-parent'になっているはず）
```

**確認項目**:

- [ ] worktreeに`.sqlew/`ディレクトリが**作成されていない**
- [ ] 本体リポの`.sqlew/sqlew.db`が使われている

### 3. Hooks自動初期化テスト

MCPサーバー起動後、自動的にHooksが設定されるはず。

**確認項目**:

- [ ] `.claude/settings.local.json` が作成された
- [ ] hooks.PreToolUse に `Task`, `Write` のmatcherがある
- [ ] hooks.PostToolUse に `Edit|Write`, `TodoWrite` のmatcherがある
- [ ] `.git/hooks/post-merge` が作成された
- [ ] `.git/hooks/post-rewrite` が作成された

### 4. 設定ファイル確認

```bash
cat .claude/settings.local.json
```

期待する構造:

```json
{
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "Task",
                "hooks": [{ "type": "command", "command": "sqlew suggest" }]
            },
            {
                "matcher": "Write",
                "hooks": [{ "type": "command", "command": "sqlew track-plan" }]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [{ "type": "command", "command": "sqlew save" }]
            },
            {
                "matcher": "TodoWrite",
                "hooks": [
                    { "type": "command", "command": "sqlew check-completion" }
                ]
            }
        ]
    }
}
```

### 5. Git Hooks確認

```bash
cat .git/hooks/post-merge
cat .git/hooks/post-rewrite
```

### 6. CLIコマンド動作確認

```bash
# ヘルプ表示
npx sqlew --help

# 各コマンドが存在するか（エラーにならないか）
echo '{}' | npx sqlew suggest
echo '{}' | npx sqlew track-plan
echo '{}' | npx sqlew save
echo '{}' | npx sqlew check-completion
```

### 7. CLAUDE.md/Skills確認

```bash
# Skillsがコピーされたか
ls -la .claude/skills/

# CLAUDE.mdにPlan Mode Integrationセクションがあるか
grep -A5 "Plan Mode Integration" CLAUDE.md
```

## 結果報告

テスト結果を以下のファイルに書き出してください:

```
C:\Users\kitayama\RustroverProjects\mcp-sqlew\.sqlew\tmp\worktree-test-result.md
```

フォーマット:

```markdown
# Worktree Test Results

## Environment

- Worktree path: (このディレクトリのパス)
- Date: YYYY-MM-DD HH:MM

## Results

### 1. Build

- Status: OK / NG
- Notes: (あれば)

### 2. Config Priority (Worktree)

- configSource: worktree-parent / local / global / default
- .sqlew/ created in worktree: Yes / No (should be No)
- Database used: (パス)

### 3. Auto-initialization (MCP startup)

- Status: OK / NG
- settings.local.json created: Yes / No

### 4. settings.local.json

- Status: OK / NG
- Content: (ファイル内容を貼り付け)

### 5. Git Hooks

- post-merge: OK / NG / Not Created
- post-rewrite: OK / NG / Not Created

### 6. CLI Commands

- suggest: OK / NG
- track-plan: OK / NG
- save: OK / NG
- check-completion: OK / NG

### 7. Skills/CLAUDE.md

- Skills copied: OK / NG
- CLAUDE.md updated: OK / NG

## Issues Found

(問題があれば詳細を記載)

## Additional Notes

(その他気づいた点)
```
