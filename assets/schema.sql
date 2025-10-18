-- MCP Shared Context Server - Database Schema
-- Version: 3.3.0 (with Decision Context, Kanban Task Watcher, activity log, smart defaults, batch ops, templates)

-- ============================================================================
-- Master Tables (Normalization)
-- ============================================================================

-- Agent Management
CREATE TABLE IF NOT EXISTS m_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- File Path Management
CREATE TABLE IF NOT EXISTS m_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL
);

-- Context Key Management
CREATE TABLE IF NOT EXISTS m_context_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL
);

-- Constraint Category Management
CREATE TABLE IF NOT EXISTS m_constraint_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Layer Management
CREATE TABLE IF NOT EXISTS m_layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Tag Management
CREATE TABLE IF NOT EXISTS m_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Scope Management (Modules/Components)
CREATE TABLE IF NOT EXISTS m_scopes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Configuration Management (Server Settings)
CREATE TABLE IF NOT EXISTS m_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================================
-- Transaction Tables
-- ============================================================================

-- Decisions (String Values)
CREATE TABLE IF NOT EXISTS t_decisions (
    key_id INTEGER PRIMARY KEY REFERENCES m_context_keys(id),
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,  -- 1=active, 2=deprecated, 3=draft
    ts INTEGER DEFAULT (unixepoch())
);

-- Decisions (Numeric Values)
CREATE TABLE IF NOT EXISTS t_decisions_numeric (
    key_id INTEGER PRIMARY KEY REFERENCES m_context_keys(id),
    value REAL NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    version TEXT DEFAULT '1.0.0',
    status INTEGER DEFAULT 1,
    ts INTEGER DEFAULT (unixepoch())
);

-- Decision Version History
CREATE TABLE IF NOT EXISTS t_decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER REFERENCES m_context_keys(id),
    version TEXT NOT NULL,
    value TEXT NOT NULL,
    agent_id INTEGER REFERENCES m_agents(id),
    ts INTEGER NOT NULL
);

-- Decision Tagging (Many-to-Many)
CREATE TABLE IF NOT EXISTS t_decision_tags (
    decision_key_id INTEGER REFERENCES m_context_keys(id),
    tag_id INTEGER REFERENCES m_tags(id),
    PRIMARY KEY (decision_key_id, tag_id)
);

-- Decision Scopes (Many-to-Many)
CREATE TABLE IF NOT EXISTS t_decision_scopes (
    decision_key_id INTEGER REFERENCES m_context_keys(id),
    scope_id INTEGER REFERENCES m_scopes(id),
    PRIMARY KEY (decision_key_id, scope_id)
);

-- Inter-Agent Messages
CREATE TABLE IF NOT EXISTS t_agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent_id INTEGER NOT NULL REFERENCES m_agents(id),
    to_agent_id INTEGER REFERENCES m_agents(id),  -- NULL = broadcast
    msg_type INTEGER NOT NULL,  -- 1=decision, 2=warning, 3=request, 4=info
    priority INTEGER DEFAULT 2,  -- 1=low, 2=medium, 3=high, 4=critical
    payload TEXT,  -- JSON string (only when needed)
    ts INTEGER DEFAULT (unixepoch()),
    read INTEGER DEFAULT 0
);

-- File Change History
CREATE TABLE IF NOT EXISTS t_file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES m_files(id),
    agent_id INTEGER NOT NULL REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    change_type INTEGER NOT NULL,  -- 1=created, 2=modified, 3=deleted
    description TEXT,
    ts INTEGER DEFAULT (unixepoch())
);

-- Constraints/Requirements
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

-- Constraint Tagging (Many-to-Many)
CREATE TABLE IF NOT EXISTS t_constraint_tags (
    constraint_id INTEGER REFERENCES t_constraints(id),
    tag_id INTEGER REFERENCES m_tags(id),
    PRIMARY KEY (constraint_id, tag_id)
);

-- Activity Log (v2.1.0 - FR-001)
CREATE TABLE IF NOT EXISTS t_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER DEFAULT (unixepoch()),
    agent_id INTEGER NOT NULL REFERENCES m_agents(id),
    action_type TEXT NOT NULL,  -- 'decision_set', 'decision_update', 'message_send', 'file_record'
    target TEXT NOT NULL,  -- key name, message id, file path, etc.
    layer_id INTEGER REFERENCES m_layers(id),
    details TEXT  -- JSON string with additional details
);

-- Decision Templates (v2.1.0 - FR-006)
CREATE TABLE IF NOT EXISTS t_decision_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    defaults TEXT NOT NULL,  -- JSON: {layer, status, tags, priority}
    required_fields TEXT,  -- JSON array: ["cve_id", "severity"]
    created_by INTEGER REFERENCES m_agents(id),
    ts INTEGER DEFAULT (unixepoch())
);

-- Decision Context (v3.3.0 - Rich Decision Documentation)
CREATE TABLE IF NOT EXISTS t_decision_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_key_id INTEGER NOT NULL REFERENCES m_context_keys(id) ON DELETE CASCADE,
    rationale TEXT NOT NULL,
    alternatives_considered TEXT,  -- JSON array: ["Alternative 1", "Alternative 2"]
    tradeoffs TEXT,  -- JSON object: {"pros": ["Pro 1"], "cons": ["Con 1"]}
    decided_by_agent_id INTEGER REFERENCES m_agents(id),
    decision_date INTEGER DEFAULT (unixepoch()),
    related_task_id INTEGER REFERENCES t_tasks(id) ON DELETE SET NULL,
    related_constraint_id INTEGER REFERENCES t_constraints(id) ON DELETE SET NULL,
    ts INTEGER DEFAULT (unixepoch()),
    UNIQUE(decision_key_id, id)
);

-- ============================================================================
-- Kanban Task Watcher (v3.0.0)
-- ============================================================================

-- Master table for task statuses
CREATE TABLE IF NOT EXISTS m_task_statuses (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- Task core data (token-efficient: no large text here)
CREATE TABLE IF NOT EXISTS t_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status_id INTEGER NOT NULL REFERENCES m_task_statuses(id),
    priority INTEGER DEFAULT 2,
    assigned_agent_id INTEGER REFERENCES m_agents(id),
    created_by_agent_id INTEGER REFERENCES m_agents(id),
    layer_id INTEGER REFERENCES m_layers(id),
    created_ts INTEGER DEFAULT (unixepoch()),
    updated_ts INTEGER DEFAULT (unixepoch()),
    completed_ts INTEGER
);

-- Task details (large text stored separately)
CREATE TABLE IF NOT EXISTS t_task_details (
    task_id INTEGER PRIMARY KEY REFERENCES t_tasks(id) ON DELETE CASCADE,
    description TEXT,
    acceptance_criteria TEXT,
    acceptance_criteria_json TEXT,  -- JSON array: [{"type": "tests_pass", "command": "npm test", "expected_pattern": "passing"}]
    notes TEXT
);

-- Task tags (many-to-many)
CREATE TABLE IF NOT EXISTS t_task_tags (
    task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES m_tags(id),
    PRIMARY KEY (task_id, tag_id)
);

-- Task-decision links
CREATE TABLE IF NOT EXISTS t_task_decision_links (
    task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    decision_key_id INTEGER REFERENCES m_context_keys(id),
    link_type TEXT DEFAULT 'implements',
    PRIMARY KEY (task_id, decision_key_id)
);

-- Task-constraint links
CREATE TABLE IF NOT EXISTS t_task_constraint_links (
    task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    constraint_id INTEGER REFERENCES t_constraints(id),
    PRIMARY KEY (task_id, constraint_id)
);

-- Task-file links
CREATE TABLE IF NOT EXISTS t_task_file_links (
    task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES m_files(id),
    PRIMARY KEY (task_id, file_id)
);

-- Task dependencies (blocking relationships)
CREATE TABLE IF NOT EXISTS t_task_dependencies (
    blocker_task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    blocked_task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
    created_ts INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (blocker_task_id, blocked_task_id)
);

-- ============================================================================
-- Indexes
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
CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON t_activity_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON t_activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON t_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_task_status ON t_tasks(status_id);
CREATE INDEX IF NOT EXISTS idx_task_updated ON t_tasks(updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON t_tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocked ON t_task_dependencies(blocked_task_id);
CREATE INDEX IF NOT EXISTS idx_decision_context_key ON t_decision_context(decision_key_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_decision_context_task ON t_decision_context(related_task_id);
CREATE INDEX IF NOT EXISTS idx_decision_context_constraint ON t_decision_context(related_constraint_id);

-- ============================================================================
-- Views (Token Efficiency)
-- ============================================================================

-- Tagged Decisions (Most Efficient View)
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

-- Active Context (Last Hour, Active Only)
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

-- Layer Summary
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

-- Unread Messages by Priority
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

-- Recent File Changes (With Layer)
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

-- Tagged Constraints
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

-- Task Board View (Token-efficient)
CREATE VIEW IF NOT EXISTS v_task_board AS
SELECT
    t.id,
    t.title,
    s.name as status,
    t.priority,
    a.name as assigned_to,
    l.name as layer,
    t.created_ts,
    t.updated_ts,
    t.completed_ts,
    (SELECT GROUP_CONCAT(tg2.name, ', ')
     FROM t_task_tags tt2
     JOIN m_tags tg2 ON tt2.tag_id = tg2.id
     WHERE tt2.task_id = t.id) as tags
FROM t_tasks t
LEFT JOIN m_task_statuses s ON t.status_id = s.id
LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
LEFT JOIN m_layers l ON t.layer_id = l.id;

-- ============================================================================
-- Triggers (Automatic Processing)
-- ============================================================================

-- Automatic Version History Recording
CREATE TRIGGER IF NOT EXISTS trg_record_decision_history
AFTER UPDATE ON t_decisions
WHEN OLD.value != NEW.value OR OLD.version != NEW.version
BEGIN
    INSERT INTO t_decision_history (key_id, version, value, agent_id, ts)
    VALUES (OLD.key_id, OLD.version, OLD.value, OLD.agent_id, OLD.ts);
END;

-- Activity Log Recording Triggers (v2.1.0 - FR-001)
-- Decision Addition Log
CREATE TRIGGER IF NOT EXISTS trg_log_decision_set
AFTER INSERT ON t_decisions
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        COALESCE(NEW.agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
        'decision_set',
        (SELECT key FROM m_context_keys WHERE id = NEW.key_id),
        NEW.layer_id,
        json_object('value', NEW.value, 'version', NEW.version, 'status', NEW.status);
END;

-- Decision Update Log
CREATE TRIGGER IF NOT EXISTS trg_log_decision_update
AFTER UPDATE ON t_decisions
WHEN OLD.value != NEW.value OR OLD.version != NEW.version OR OLD.status != NEW.status
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        COALESCE(NEW.agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
        'decision_update',
        (SELECT key FROM m_context_keys WHERE id = NEW.key_id),
        NEW.layer_id,
        json_object('old_value', OLD.value, 'new_value', NEW.value, 'old_version', OLD.version, 'new_version', NEW.version, 'old_status', OLD.status, 'new_status', NEW.status);
END;

-- Message Send Log
CREATE TRIGGER IF NOT EXISTS trg_log_message_send
AFTER INSERT ON t_agent_messages
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        NEW.from_agent_id,
        'message_send',
        'msg_id:' || NEW.id,
        NULL,
        json_object('to_agent_id', NEW.to_agent_id, 'msg_type', NEW.msg_type, 'priority', NEW.priority);
END;

-- File Change Log
CREATE TRIGGER IF NOT EXISTS trg_log_file_record
AFTER INSERT ON t_file_changes
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        NEW.agent_id,
        'file_record',
        (SELECT path FROM m_files WHERE id = NEW.file_id),
        NEW.layer_id,
        json_object('change_type', NEW.change_type, 'description', NEW.description);
END;

-- Task Activity Log Triggers
CREATE TRIGGER IF NOT EXISTS trg_log_task_create
AFTER INSERT ON t_tasks
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        COALESCE(NEW.created_by_agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
        'task_create',
        'task_id:' || NEW.id,
        NEW.layer_id,
        json_object('title', NEW.title, 'status_id', NEW.status_id, 'priority', NEW.priority);
END;

CREATE TRIGGER IF NOT EXISTS trg_log_task_status_change
AFTER UPDATE OF status_id ON t_tasks
WHEN OLD.status_id != NEW.status_id
BEGIN
    INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
    SELECT
        COALESCE(NEW.assigned_agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
        'task_status_change',
        'task_id:' || NEW.id,
        NEW.layer_id,
        json_object('old_status', OLD.status_id, 'new_status', NEW.status_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_update_task_timestamp
AFTER UPDATE ON t_tasks
BEGIN
    UPDATE t_tasks SET updated_ts = unixepoch() WHERE id = NEW.id;
END;

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Standard Layers
INSERT OR IGNORE INTO m_layers (name) VALUES 
    ('presentation'),
    ('business'),
    ('data'),
    ('infrastructure'),
    ('cross-cutting');

-- Standard Categories
INSERT OR IGNORE INTO m_constraint_categories (name) VALUES
    ('performance'),
    ('architecture'),
    ('security');

-- Common Tags
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

-- Default Settings (Auto-deletion Configuration)
INSERT OR IGNORE INTO m_config (key, value) VALUES
    ('autodelete_ignore_weekend', '0'),
    ('autodelete_message_hours', '24'),
    ('autodelete_file_history_days', '7'),
    ('task_stale_hours_in_progress', '2'),
    ('task_stale_hours_waiting_review', '24'),
    ('task_auto_stale_enabled', '1');

-- Task Statuses (1=todo, 2=in_progress, 3=waiting_review, 4=blocked, 5=done, 6=archived)
INSERT OR IGNORE INTO m_task_statuses (id, name) VALUES
    (1, 'todo'),
    (2, 'in_progress'),
    (3, 'waiting_review'),
    (4, 'blocked'),
    (5, 'done'),
    (6, 'archived');

-- Built-in Templates (Built-in Decision Templates - FR-006)
INSERT OR IGNORE INTO t_decision_templates (name, defaults, required_fields, created_by, ts) VALUES
    ('breaking_change', '{"layer":"business","status":"active","tags":["breaking"]}', NULL, NULL, unixepoch()),
    ('security_vulnerability', '{"layer":"infrastructure","status":"active","tags":["security","vulnerability"]}', '["cve_id","severity"]', NULL, unixepoch()),
    ('performance_optimization', '{"layer":"business","status":"active","tags":["performance","optimization"]}', NULL, NULL, unixepoch()),
    ('deprecation', '{"layer":"business","status":"active","tags":["deprecation"]}', NULL, NULL, unixepoch()),
    ('architecture_decision', '{"layer":"infrastructure","status":"active","tags":["architecture","adr"]}', NULL, NULL, unixepoch());
