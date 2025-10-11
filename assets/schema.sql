-- MCP Shared Context Server - Database Schema
-- Version: 1.1.0 (with configurable weekend-aware auto-deletion)

-- ============================================================================
-- マスターテーブル群（正規化）
-- ============================================================================

-- エージェント管理
CREATE TABLE IF NOT EXISTS m_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- ファイルパス管理
CREATE TABLE IF NOT EXISTS m_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL
);

-- コンテキストキー管理
CREATE TABLE IF NOT EXISTS m_context_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL
);

-- 制約カテゴリ管理
CREATE TABLE IF NOT EXISTS m_constraint_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- レイヤー管理
CREATE TABLE IF NOT EXISTS m_layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- タグ管理
CREATE TABLE IF NOT EXISTS m_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- スコープ管理（モジュール・コンポーネント）
CREATE TABLE IF NOT EXISTS m_scopes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- 設定管理（サーバー設定）
CREATE TABLE IF NOT EXISTS m_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================================
-- トランザクションテーブル群
-- ============================================================================

-- 決定事項（文字列値）
CREATE TABLE IF NOT EXISTS t_decisions (
    key_id INTEGER PRIMARY KEY REFERENCES m_context_keys(id),
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,  -- 1=active, 2=deprecated, 3=draft
    ts INTEGER DEFAULT (unixepoch())
);

-- 決定事項（数値）
CREATE TABLE IF NOT EXISTS t_decisions_numeric (
    key_id INTEGER PRIMARY KEY REFERENCES m_context_keys(id),
    value REAL NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,
    ts INTEGER DEFAULT (unixepoch())
);

-- 決定事項のバージョン履歴
CREATE TABLE IF NOT EXISTS t_decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER REFERENCES m_context_keys(id),
    version TEXT NOT NULL,
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    ts INTEGER NOT NULL
);

-- 決定事項へのタグ付け（多対多）
CREATE TABLE IF NOT EXISTS t_decision_tags (
    decision_key_id INTEGER REFERENCES m_context_keys(id),
    tag_id INTEGER REFERENCES m_tags(id),
    PRIMARY KEY (decision_key_id, tag_id)
);

-- 決定事項のスコープ（多対多）
CREATE TABLE IF NOT EXISTS t_decision_scopes (
    decision_key_id INTEGER REFERENCES m_context_keys(id),
    scope_id INTEGER REFERENCES m_scopes(id),
    PRIMARY KEY (decision_key_id, scope_id)
);

-- エージェント間メッセージ
CREATE TABLE IF NOT EXISTS t_agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent_id INTEGER NOT NULL REFERENCES m_agents(id),
    to_agent_id INTEGER REFERENCES m_agents(id),  -- NULL = broadcast
    msg_type INTEGER NOT NULL,  -- 1=decision, 2=warning, 3=request, 4=info
    priority INTEGER DEFAULT 2,  -- 1=low, 2=medium, 3=high, 4=critical
    payload TEXT,  -- JSON文字列（必要な場合のみ）
    ts INTEGER DEFAULT (unixepoch()),
    read INTEGER DEFAULT 0
);

-- ファイル変更履歴
CREATE TABLE IF NOT EXISTS t_file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES m_files(id),
    agent_id INTEGER NOT NULL REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    change_type INTEGER NOT NULL,  -- 1=created, 2=modified, 3=deleted
    description TEXT,
    ts INTEGER DEFAULT (unixepoch())
);

-- 制約・要件
CREATE TABLE IF NOT EXISTS t_constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES m_constraint_categories(id),
    layer_id INTEGER REFERENCES m_layers(id),
    constraint_text TEXT NOT NULL,
    priority INTEGER DEFAULT 2,  -- 1=low, 2=medium, 3=high, 4=critical
    active INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES m_agents(id),
    ts INTEGER DEFAULT (unixepoch())
);

-- 制約へのタグ付け（多対多）
CREATE TABLE IF NOT EXISTS t_constraint_tags (
    constraint_id INTEGER REFERENCES t_constraints(id),
    tag_id INTEGER REFERENCES m_tags(id),
    PRIMARY KEY (constraint_id, tag_id)
);

-- ============================================================================
-- インデックス
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_decisions_ts ON t_decisions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_layer ON t_decisions(layer_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON t_decisions(status);
CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON t_agent_messages(to_agent_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON t_agent_messages(ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_priority ON t_agent_messages(priority DESC);
CREATE INDEX IF NOT EXISTS idx_file_changes_ts ON t_file_changes(ts DESC);
CREATE INDEX IF NOT EXISTS idx_file_changes_file ON t_file_changes(file_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_layer ON t_file_changes(layer_id);
CREATE INDEX IF NOT EXISTS idx_constraints_active ON t_constraints(active, category_id);
CREATE INDEX IF NOT EXISTS idx_constraints_priority ON t_constraints(priority DESC);
CREATE INDEX IF NOT EXISTS idx_decision_tags_tag ON t_decision_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_decision_scopes_scope ON t_decision_scopes(scope_id);

-- ============================================================================
-- ビュー（トークン効率化）
-- ============================================================================

-- タグ付き決定事項（最も効率的なビュー）
CREATE VIEW IF NOT EXISTS v_tagged_decisions AS
SELECT
    k.key,
    d.value,
    d.version,
    CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
    l.name as layer,
    (SELECT GROUP_CONCAT(t2.name, ',') FROM t_decision_tags dt2
     JOIN m_tags t2 ON dt2.tag_id = t2.id
     WHERE dt2.decision_key_id = d.key_id) as tags,
    (SELECT GROUP_CONCAT(s2.name, ',') FROM t_decision_scopes ds2
     JOIN m_scopes s2 ON ds2.scope_id = s2.id
     WHERE ds2.decision_key_id = d.key_id) as scopes,
    a.name as decided_by,
    datetime(d.ts, 'unixepoch') as updated
FROM t_decisions d
JOIN m_context_keys k ON d.key_id = k.id
LEFT JOIN m_layers l ON d.layer_id = l.id
LEFT JOIN m_agents a ON d.agent_id = a.id;

-- アクティブなコンテキスト（直近1時間、アクティブのみ）
CREATE VIEW IF NOT EXISTS v_active_context AS
SELECT 
    k.key,
    d.value,
    d.version,
    l.name as layer,
    a.name as decided_by,
    datetime(d.ts, 'unixepoch') as updated
FROM t_decisions d
JOIN m_context_keys k ON d.key_id = k.id
LEFT JOIN m_layers l ON d.layer_id = l.id
LEFT JOIN m_agents a ON d.agent_id = a.id
WHERE d.status = 1 AND d.ts > unixepoch() - 3600
ORDER BY d.ts DESC;

-- レイヤー別サマリー
CREATE VIEW IF NOT EXISTS v_layer_summary AS
SELECT 
    l.name as layer,
    COUNT(DISTINCT d.key_id) as decisions_count,
    COUNT(DISTINCT fc.id) as file_changes_count,
    COUNT(DISTINCT c.id) as constraints_count
FROM m_layers l
LEFT JOIN t_decisions d ON l.id = d.layer_id AND d.status = 1
LEFT JOIN t_file_changes fc ON l.id = fc.layer_id AND fc.ts > unixepoch() - 3600
LEFT JOIN t_constraints c ON l.id = c.layer_id AND c.active = 1
GROUP BY l.id;

-- 優先度別未読メッセージ
CREATE VIEW IF NOT EXISTS v_unread_messages_by_priority AS
SELECT 
    a.name as agent,
    CASE m.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
    COUNT(*) as count
FROM t_agent_messages m
JOIN m_agents a ON m.to_agent_id = a.id
WHERE m.read = 0
GROUP BY m.to_agent_id, m.priority
ORDER BY m.priority DESC;

-- 最近のファイル変更（レイヤー付き）
CREATE VIEW IF NOT EXISTS v_recent_file_changes AS
SELECT 
    f.path,
    a.name as changed_by,
    l.name as layer,
    CASE fc.change_type WHEN 1 THEN 'created' WHEN 2 THEN 'modified' ELSE 'deleted' END as change_type,
    fc.description,
    datetime(fc.ts, 'unixepoch') as changed_at
FROM t_file_changes fc
JOIN m_files f ON fc.file_id = f.id
JOIN m_agents a ON fc.agent_id = a.id
LEFT JOIN m_layers l ON fc.layer_id = l.id
WHERE fc.ts > unixepoch() - 3600
ORDER BY fc.ts DESC;

-- タグ付き制約
CREATE VIEW IF NOT EXISTS v_tagged_constraints AS
SELECT
    c.id,
    cc.name as category,
    l.name as layer,
    c.constraint_text,
    CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
    (SELECT GROUP_CONCAT(t2.name, ',') FROM t_constraint_tags ct2
     JOIN m_tags t2 ON ct2.tag_id = t2.id
     WHERE ct2.constraint_id = c.id) as tags,
    a.name as created_by,
    datetime(c.ts, 'unixepoch') as created_at
FROM t_constraints c
JOIN m_constraint_categories cc ON c.category_id = cc.id
LEFT JOIN m_layers l ON c.layer_id = l.id
LEFT JOIN m_agents a ON c.created_by = a.id
WHERE c.active = 1
ORDER BY c.priority DESC, cc.name, c.ts DESC;

-- ============================================================================
-- トリガー（自動処理）
-- ============================================================================

-- バージョン履歴の自動記録
CREATE TRIGGER IF NOT EXISTS trg_record_decision_history
AFTER UPDATE ON t_decisions
WHEN OLD.value != NEW.value OR OLD.version != NEW.version
BEGIN
    INSERT INTO t_decision_history (key_id, version, value, agent_id, ts)
    VALUES (OLD.key_id, OLD.version, OLD.value, OLD.agent_id, OLD.ts);
END;

-- ============================================================================
-- 初期データ
-- ============================================================================

-- 標準レイヤー
INSERT OR IGNORE INTO m_layers (name) VALUES 
    ('presentation'),
    ('business'),
    ('data'),
    ('infrastructure'),
    ('cross-cutting');

-- 標準カテゴリ
INSERT OR IGNORE INTO m_constraint_categories (name) VALUES
    ('performance'),
    ('architecture'),
    ('security');

-- よくあるタグ
INSERT OR IGNORE INTO m_tags (name) VALUES
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

-- デフォルト設定（自動削除の設定）
INSERT OR IGNORE INTO m_config (key, value) VALUES
    ('autodelete_ignore_weekend', '0'),
    ('autodelete_message_hours', '24'),
    ('autodelete_file_history_days', '7');
