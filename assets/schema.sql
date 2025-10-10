-- MCP Shared Context Server - Database Schema
-- Version: 1.1.0 (with metadata support)

-- ============================================================================
-- マスターテーブル群（正規化）
-- ============================================================================

-- エージェント管理
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- ファイルパス管理
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL
);

-- コンテキストキー管理
CREATE TABLE IF NOT EXISTS context_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL
);

-- 制約カテゴリ管理
CREATE TABLE IF NOT EXISTS constraint_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- レイヤー管理
CREATE TABLE IF NOT EXISTS layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- タグ管理
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- スコープ管理（モジュール・コンポーネント）
CREATE TABLE IF NOT EXISTS scopes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- ============================================================================
-- トランザクションテーブル群
-- ============================================================================

-- 決定事項（文字列値）
CREATE TABLE IF NOT EXISTS decisions (
    key_id INTEGER PRIMARY KEY REFERENCES context_keys(id),
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES agents(id),
    layer_id INTEGER REFERENCES layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,  -- 1=active, 2=deprecated, 3=draft
    ts INTEGER DEFAULT (unixepoch())
);

-- 決定事項（数値）
CREATE TABLE IF NOT EXISTS decisions_numeric (
    key_id INTEGER PRIMARY KEY REFERENCES context_keys(id),
    value REAL NOT NULL,
    agent_id INTEGER REFERENCES agents(id),
    layer_id INTEGER REFERENCES layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,
    ts INTEGER DEFAULT (unixepoch())
);

-- 決定事項のバージョン履歴
CREATE TABLE IF NOT EXISTS decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER REFERENCES context_keys(id),
    version TEXT NOT NULL,
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES agents(id),
    ts INTEGER NOT NULL
);

-- 決定事項へのタグ付け（多対多）
CREATE TABLE IF NOT EXISTS decision_tags (
    decision_key_id INTEGER REFERENCES context_keys(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (decision_key_id, tag_id)
);

-- 決定事項のスコープ（多対多）
CREATE TABLE IF NOT EXISTS decision_scopes (
    decision_key_id INTEGER REFERENCES context_keys(id),
    scope_id INTEGER REFERENCES scopes(id),
    PRIMARY KEY (decision_key_id, scope_id)
);

-- エージェント間メッセージ
CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent_id INTEGER NOT NULL REFERENCES agents(id),
    to_agent_id INTEGER REFERENCES agents(id),  -- NULL = broadcast
    msg_type INTEGER NOT NULL,  -- 1=decision, 2=warning, 3=request, 4=info
    priority INTEGER DEFAULT 2,  -- 1=low, 2=medium, 3=high, 4=critical
    payload TEXT,  -- JSON文字列（必要な場合のみ）
    ts INTEGER DEFAULT (unixepoch()),
    read INTEGER DEFAULT 0
);

-- ファイル変更履歴
CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id),
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    layer_id INTEGER REFERENCES layers(id),
    change_type INTEGER NOT NULL,  -- 1=created, 2=modified, 3=deleted
    description TEXT,
    ts INTEGER DEFAULT (unixepoch())
);

-- 制約・要件
CREATE TABLE IF NOT EXISTS constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES constraint_categories(id),
    layer_id INTEGER REFERENCES layers(id),
    constraint_text TEXT NOT NULL,
    priority INTEGER DEFAULT 2,  -- 1=low, 2=medium, 3=high, 4=critical
    active INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES agents(id),
    ts INTEGER DEFAULT (unixepoch())
);

-- 制約へのタグ付け（多対多）
CREATE TABLE IF NOT EXISTS constraint_tags (
    constraint_id INTEGER REFERENCES constraints(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (constraint_id, tag_id)
);

-- ============================================================================
-- インデックス
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_layer ON decisions(layer_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON agent_messages(to_agent_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON agent_messages(ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_priority ON agent_messages(priority DESC);
CREATE INDEX IF NOT EXISTS idx_file_changes_ts ON file_changes(ts DESC);
CREATE INDEX IF NOT EXISTS idx_file_changes_file ON file_changes(file_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_layer ON file_changes(layer_id);
CREATE INDEX IF NOT EXISTS idx_constraints_active ON constraints(active, category_id);
CREATE INDEX IF NOT EXISTS idx_constraints_priority ON constraints(priority DESC);
CREATE INDEX IF NOT EXISTS idx_decision_tags_tag ON decision_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_decision_scopes_scope ON decision_scopes(scope_id);

-- ============================================================================
-- ビュー（トークン効率化）
-- ============================================================================

-- タグ付き決定事項（最も効率的なビュー）
CREATE VIEW IF NOT EXISTS tagged_decisions AS
SELECT
    k.key,
    d.value,
    d.version,
    CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
    l.name as layer,
    (SELECT GROUP_CONCAT(t2.name, ',') FROM decision_tags dt2
     JOIN tags t2 ON dt2.tag_id = t2.id
     WHERE dt2.decision_key_id = d.key_id) as tags,
    (SELECT GROUP_CONCAT(s2.name, ',') FROM decision_scopes ds2
     JOIN scopes s2 ON ds2.scope_id = s2.id
     WHERE ds2.decision_key_id = d.key_id) as scopes,
    a.name as decided_by,
    datetime(d.ts, 'unixepoch') as updated
FROM decisions d
JOIN context_keys k ON d.key_id = k.id
LEFT JOIN layers l ON d.layer_id = l.id
LEFT JOIN agents a ON d.agent_id = a.id;

-- アクティブなコンテキスト（直近1時間、アクティブのみ）
CREATE VIEW IF NOT EXISTS active_context AS
SELECT 
    k.key,
    d.value,
    d.version,
    l.name as layer,
    a.name as decided_by,
    datetime(d.ts, 'unixepoch') as updated
FROM decisions d
JOIN context_keys k ON d.key_id = k.id
LEFT JOIN layers l ON d.layer_id = l.id
LEFT JOIN agents a ON d.agent_id = a.id
WHERE d.status = 1 AND d.ts > unixepoch() - 3600
ORDER BY d.ts DESC;

-- レイヤー別サマリー
CREATE VIEW IF NOT EXISTS layer_summary AS
SELECT 
    l.name as layer,
    COUNT(DISTINCT d.key_id) as decisions_count,
    COUNT(DISTINCT fc.id) as file_changes_count,
    COUNT(DISTINCT c.id) as constraints_count
FROM layers l
LEFT JOIN decisions d ON l.id = d.layer_id AND d.status = 1
LEFT JOIN file_changes fc ON l.id = fc.layer_id AND fc.ts > unixepoch() - 3600
LEFT JOIN constraints c ON l.id = c.layer_id AND c.active = 1
GROUP BY l.id;

-- 優先度別未読メッセージ
CREATE VIEW IF NOT EXISTS unread_messages_by_priority AS
SELECT 
    a.name as agent,
    CASE m.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
    COUNT(*) as count
FROM agent_messages m
JOIN agents a ON m.to_agent_id = a.id
WHERE m.read = 0
GROUP BY m.to_agent_id, m.priority
ORDER BY m.priority DESC;

-- 最近のファイル変更（レイヤー付き）
CREATE VIEW IF NOT EXISTS recent_file_changes AS
SELECT 
    f.path,
    a.name as changed_by,
    l.name as layer,
    CASE fc.change_type WHEN 1 THEN 'created' WHEN 2 THEN 'modified' ELSE 'deleted' END as change_type,
    fc.description,
    datetime(fc.ts, 'unixepoch') as changed_at
FROM file_changes fc
JOIN files f ON fc.file_id = f.id
JOIN agents a ON fc.agent_id = a.id
LEFT JOIN layers l ON fc.layer_id = l.id
WHERE fc.ts > unixepoch() - 3600
ORDER BY fc.ts DESC;

-- タグ付き制約
CREATE VIEW IF NOT EXISTS tagged_constraints AS
SELECT
    c.id,
    cc.name as category,
    l.name as layer,
    c.constraint_text,
    CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
    (SELECT GROUP_CONCAT(t2.name, ',') FROM constraint_tags ct2
     JOIN tags t2 ON ct2.tag_id = t2.id
     WHERE ct2.constraint_id = c.id) as tags,
    a.name as created_by,
    datetime(c.ts, 'unixepoch') as created_at
FROM constraints c
JOIN constraint_categories cc ON c.category_id = cc.id
LEFT JOIN layers l ON c.layer_id = l.id
LEFT JOIN agents a ON c.created_by = a.id
WHERE c.active = 1
ORDER BY c.priority DESC, cc.name, c.ts DESC;

-- ============================================================================
-- トリガー（自動処理）
-- ============================================================================

-- 古いメッセージの自動削除（24時間以上前）
CREATE TRIGGER IF NOT EXISTS cleanup_old_messages
AFTER INSERT ON agent_messages
BEGIN
    DELETE FROM agent_messages
    WHERE ts < unixepoch() - 86400;
END;

-- 古いファイル変更履歴の削除（7日以上前）
CREATE TRIGGER IF NOT EXISTS cleanup_old_file_changes
AFTER INSERT ON file_changes
BEGIN
    DELETE FROM file_changes
    WHERE ts < unixepoch() - 604800;
END;

-- バージョン履歴の自動記録
CREATE TRIGGER IF NOT EXISTS record_decision_history
AFTER UPDATE ON decisions
WHEN OLD.value != NEW.value OR OLD.version != NEW.version
BEGIN
    INSERT INTO decision_history (key_id, version, value, agent_id, ts)
    VALUES (OLD.key_id, OLD.version, OLD.value, OLD.agent_id, OLD.ts);
END;

-- ============================================================================
-- 初期データ
-- ============================================================================

-- 標準レイヤー
INSERT OR IGNORE INTO layers (name) VALUES 
    ('presentation'),
    ('business'),
    ('data'),
    ('infrastructure'),
    ('cross-cutting');

-- 標準カテゴリ
INSERT OR IGNORE INTO constraint_categories (name) VALUES
    ('performance'),
    ('architecture'),
    ('security');

-- よくあるタグ
INSERT OR IGNORE INTO tags (name) VALUES
    ('authentication'),
    ('authorization'),
    ('performance'),
    ('security'),
    ('api'),
    ('database'),
    ('caching'),
    ('testing'),
    ('validation'),
    ('error-handling');
