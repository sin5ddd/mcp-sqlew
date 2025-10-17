/**
 * Migration: Convert Task-Like Decisions to Tasks
 *
 * This migration detects decisions being used for task/todo tracking
 * and migrates them to the dedicated task management system.
 *
 * Features:
 * - Heuristic detection of task-like decisions
 * - Dry-run mode to preview before executing
 * - Confidence scoring for each detection
 * - Links tasks to original decisions for traceability
 * - Optional deprecation of original decisions
 *
 * Detection Heuristics:
 * - Keys containing: task_, _task, todo_, _todo, wip_, _wip, implement_, fix_
 * - Tags containing: task, todo, in_progress, wip, blocked, done
 * - Values containing: TODO:, WIP:, DONE:, BLOCKED:, [ ], [x]
 * - Status indicators in value (e.g., "Status: in_progress")
 */

import { Database } from 'better-sqlite3';

export interface DecisionTaskMapping {
  decisionKey: string;
  taskTitle: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  layer: string | null;
  assignee: string | null;
  confidence: number; // 0-100%
  detectionReasons: string[];
}

export interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
  mappings?: DecisionTaskMapping[];
}

/**
 * Extract status from decision value
 *
 * Patterns:
 * - "Status: in_progress"
 * - "TODO: Description"
 * - "WIP: Description"
 * - "DONE: Description"
 * - "BLOCKED: Description"
 * - "[x] Description" (done)
 * - "[ ] Description" (todo)
 */
function extractStatus(value: string): string {
  const valueLower = value.toLowerCase();

  // Check for explicit status markers
  if (valueLower.includes('status:')) {
    const statusMatch = valueLower.match(/status:\s*(\w+)/);
    if (statusMatch) {
      const status = statusMatch[1];
      if (status.includes('progress') || status === 'wip') return 'in_progress';
      if (status.includes('review') || status.includes('waiting')) return 'waiting_review';
      if (status === 'blocked') return 'blocked';
      if (status === 'done' || status === 'complete') return 'done';
      if (status === 'todo' || status === 'pending') return 'todo';
    }
  }

  // Check for prefix markers
  if (valueLower.startsWith('wip:') || valueLower.startsWith('in progress:')) return 'in_progress';
  if (valueLower.startsWith('done:') || valueLower.startsWith('completed:')) return 'done';
  if (valueLower.startsWith('blocked:')) return 'blocked';
  if (valueLower.startsWith('todo:') || valueLower.startsWith('pending:')) return 'todo';
  if (valueLower.startsWith('review:') || valueLower.startsWith('waiting:')) return 'waiting_review';

  // Check for markdown checkboxes
  if (value.trim().startsWith('[x]') || value.trim().startsWith('[X]')) return 'done';
  if (value.trim().startsWith('[ ]')) return 'todo';

  // Default to todo
  return 'todo';
}

/**
 * Extract priority from decision value or tags
 */
function extractPriority(value: string, tags: string[]): string {
  const valueLower = value.toLowerCase();
  const allTags = tags.join(',').toLowerCase();

  // Check for explicit priority markers
  if (valueLower.includes('priority:') || valueLower.includes('p:')) {
    if (valueLower.includes('critical') || valueLower.includes('p0') || valueLower.includes('p:0')) return 'critical';
    if (valueLower.includes('high') || valueLower.includes('p1') || valueLower.includes('p:1')) return 'high';
    if (valueLower.includes('medium') || valueLower.includes('p2') || valueLower.includes('p:2')) return 'medium';
    if (valueLower.includes('low') || valueLower.includes('p3') || valueLower.includes('p:3')) return 'low';
  }

  // Check tags
  if (allTags.includes('critical') || allTags.includes('urgent')) return 'critical';
  if (allTags.includes('high') || allTags.includes('important')) return 'high';
  if (allTags.includes('low')) return 'low';

  // Default to medium
  return 'medium';
}

/**
 * Clean task title from decision key
 *
 * Removes prefixes like "task_", "todo_", "wip_"
 * Converts snake_case to Title Case
 */
function cleanTaskTitle(key: string): string {
  // Remove common prefixes
  let cleaned = key
    .replace(/^task_/i, '')
    .replace(/^todo_/i, '')
    .replace(/^wip_/i, '')
    .replace(/^implement_/i, '')
    .replace(/^fix_/i, '')
    .replace(/_task$/i, '')
    .replace(/_todo$/i, '');

  // Convert snake_case to Title Case
  cleaned = cleaned
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return cleaned;
}

/**
 * Extract description from decision value
 *
 * Removes status prefixes and markers
 */
function extractDescription(value: string): string {
  let description = value;

  // Remove status prefixes
  description = description
    .replace(/^(TODO|WIP|DONE|BLOCKED|REVIEW|WAITING|STATUS):\s*/i, '')
    .replace(/^Status:\s*\w+\s*-?\s*/i, '')
    .replace(/^\[[ xX]\]\s*/, '');

  // Trim
  description = description.trim();

  return description;
}

/**
 * Detect if a decision is task-like
 *
 * @param key - Decision key
 * @param value - Decision value
 * @param tags - Decision tags
 * @returns Confidence score (0-100) and reasons
 */
function detectTaskLikeDecision(
  key: string,
  value: string,
  tags: string[]
): { confidence: number; reasons: string[] } {
  let confidence = 0;
  const reasons: string[] = [];

  const keyLower = key.toLowerCase();
  const valueLower = value.toLowerCase();
  const allTags = tags.join(',').toLowerCase();

  // Key pattern matching (high confidence)
  if (keyLower.includes('task_') || keyLower.includes('_task')) {
    confidence += 30;
    reasons.push('Key contains "task"');
  }
  if (keyLower.includes('todo_') || keyLower.includes('_todo')) {
    confidence += 30;
    reasons.push('Key contains "todo"');
  }
  if (keyLower.includes('wip_') || keyLower.includes('_wip')) {
    confidence += 25;
    reasons.push('Key contains "wip"');
  }
  if (keyLower.startsWith('implement_') || keyLower.startsWith('fix_')) {
    confidence += 20;
    reasons.push('Key starts with "implement" or "fix"');
  }

  // Tag matching (high confidence)
  if (allTags.includes('task')) {
    confidence += 25;
    reasons.push('Has "task" tag');
  }
  if (allTags.includes('todo')) {
    confidence += 25;
    reasons.push('Has "todo" tag');
  }
  if (allTags.includes('in_progress') || allTags.includes('wip')) {
    confidence += 20;
    reasons.push('Has "in_progress" or "wip" tag');
  }
  if (allTags.includes('blocked')) {
    confidence += 20;
    reasons.push('Has "blocked" tag');
  }
  if (allTags.includes('done') && allTags.includes('task')) {
    confidence += 15;
    reasons.push('Has both "done" and "task" tags');
  }

  // Value pattern matching (medium confidence)
  if (valueLower.includes('status:')) {
    confidence += 15;
    reasons.push('Value contains "Status:"');
  }
  if (valueLower.startsWith('todo:') || valueLower.startsWith('wip:') || valueLower.startsWith('done:')) {
    confidence += 15;
    reasons.push('Value starts with status prefix');
  }
  if (value.trim().match(/^\[[ xX]\]/)) {
    confidence += 15;
    reasons.push('Value starts with markdown checkbox');
  }
  if (valueLower.includes('blocked:')) {
    confidence += 15;
    reasons.push('Value contains "blocked:"');
  }

  // Cap at 100
  confidence = Math.min(100, confidence);

  return { confidence, reasons };
}

/**
 * Detect all task-like decisions in the database
 *
 * @param db - Database connection
 * @param minConfidence - Minimum confidence threshold (0-100, default: 50)
 * @returns Array of decision-task mappings
 */
export function detectTaskLikeDecisions(
  db: Database,
  minConfidence: number = 50
): DecisionTaskMapping[] {
  const mappings: DecisionTaskMapping[] = [];

  try {
    // Query all active decisions with their tags and layers
    const decisions = db.prepare(`
      SELECT
        ck.key as decision_key,
        d.value,
        l.name as layer,
        d.agent_id,
        a.name as agent_name,
        GROUP_CONCAT(t.name, ',') as tags
      FROM t_decisions d
      JOIN m_context_keys ck ON d.key_id = ck.id
      LEFT JOIN m_layers l ON d.layer_id = l.id
      LEFT JOIN m_agents a ON d.agent_id = a.id
      LEFT JOIN t_decision_tags dt ON d.key_id = dt.decision_key_id
      LEFT JOIN m_tags t ON dt.tag_id = t.id
      WHERE d.status = 1  -- active only
      GROUP BY ck.key
    `).all() as Array<{
      decision_key: string;
      value: string;
      layer: string | null;
      agent_id: number | null;
      agent_name: string | null;
      tags: string | null;
    }>;

    for (const decision of decisions) {
      const tags = decision.tags ? decision.tags.split(',').filter(t => t.trim()) : [];

      // Detect if task-like
      const { confidence, reasons } = detectTaskLikeDecision(
        decision.decision_key,
        decision.value,
        tags
      );

      if (confidence >= minConfidence) {
        const mapping: DecisionTaskMapping = {
          decisionKey: decision.decision_key,
          taskTitle: cleanTaskTitle(decision.decision_key),
          description: extractDescription(decision.value),
          status: extractStatus(decision.value),
          priority: extractPriority(decision.value, tags),
          tags: tags.filter(t => !['task', 'todo', 'wip', 'in_progress', 'blocked', 'done'].includes(t.toLowerCase())),
          layer: decision.layer,
          assignee: decision.agent_name,
          confidence,
          detectionReasons: reasons,
        };

        mappings.push(mapping);
      }
    }

    // Sort by confidence (highest first)
    mappings.sort((a, b) => b.confidence - a.confidence);

    return mappings;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to detect task-like decisions: ${message}`);
  }
}

/**
 * Migrate decisions to tasks
 *
 * @param db - Database connection
 * @param dryRun - If true, only preview without executing (default: true)
 * @param minConfidence - Minimum confidence threshold (default: 50)
 * @param deprecateOriginal - If true, mark original decisions as deprecated (default: false)
 * @returns Migration result with mappings
 */
export function migrateDecisionsToTasks(
  db: Database,
  dryRun: boolean = true,
  minConfidence: number = 50,
  deprecateOriginal: boolean = false
): MigrationResult {
  const details: string[] = [];

  try {
    // Detect task-like decisions
    const mappings = detectTaskLikeDecisions(db, minConfidence);

    if (mappings.length === 0) {
      return {
        success: true,
        message: 'No task-like decisions detected',
        details: [`Minimum confidence threshold: ${minConfidence}%`],
        mappings: [],
      };
    }

    details.push(`Detected ${mappings.length} task-like decisions (confidence ≥ ${minConfidence}%)`);

    if (dryRun) {
      details.push('DRY-RUN MODE: No changes will be made');
      details.push('');
      details.push('Migration preview:');

      mappings.forEach((mapping, i) => {
        details.push('');
        details.push(`${i + 1}. Decision: ${mapping.decisionKey} (${mapping.confidence}% confidence)`);
        details.push(`   → Task: ${mapping.taskTitle}`);
        details.push(`   → Status: ${mapping.status}`);
        details.push(`   → Priority: ${mapping.priority}`);
        if (mapping.tags.length > 0) {
          details.push(`   → Tags: ${mapping.tags.join(', ')}`);
        }
        if (mapping.layer) {
          details.push(`   → Layer: ${mapping.layer}`);
        }
        if (mapping.assignee) {
          details.push(`   → Assignee: ${mapping.assignee}`);
        }
        details.push(`   → Detection reasons: ${mapping.detectionReasons.join(', ')}`);
      });

      return {
        success: true,
        message: `Dry-run complete: ${mappings.length} decisions would be migrated`,
        details,
        mappings,
      };
    }

    // Execute migration in transaction
    db.exec('BEGIN TRANSACTION');

    try {
      const createdTasks: number[] = [];

      for (const mapping of mappings) {
        // 1. Get IDs for foreign keys
        const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get(mapping.status) as { id: number } | undefined;
        if (!statusId) {
          throw new Error(`Invalid status: ${mapping.status}`);
        }

        let layerId: number | null = null;
        if (mapping.layer) {
          const layer = db.prepare('SELECT id FROM m_layers WHERE name = ?').get(mapping.layer) as { id: number } | undefined;
          layerId = layer ? layer.id : null;
        }

        let assigneeId: number | null = null;
        if (mapping.assignee) {
          const agent = db.prepare('SELECT id FROM m_agents WHERE name = ?').get(mapping.assignee) as { id: number } | undefined;
          assigneeId = agent ? agent.id : null;
        }

        // Priority mapping
        const priorityMap: Record<string, number> = {
          low: 1,
          medium: 2,
          high: 3,
          critical: 4,
        };
        const priority = priorityMap[mapping.priority] || 2;

        // 2. Insert task
        const taskResult = db.prepare(`
          INSERT INTO t_tasks (title, status_id, priority, assigned_agent_id, layer_id, created_ts, updated_ts)
          VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
        `).run(mapping.taskTitle, statusId.id, priority, assigneeId, layerId);

        const taskId = taskResult.lastInsertRowid as number;
        createdTasks.push(taskId);

        // 3. Insert task details (description)
        db.prepare(`
          INSERT INTO t_task_details (task_id, description)
          VALUES (?, ?)
        `).run(taskId, mapping.description);

        // 4. Insert task tags
        for (const tagName of mapping.tags) {
          // Get or create tag
          db.prepare('INSERT OR IGNORE INTO m_tags (name) VALUES (?)').run(tagName);
          const tag = db.prepare('SELECT id FROM m_tags WHERE name = ?').get(tagName) as { id: number };

          db.prepare(`
            INSERT INTO t_task_tags (task_id, tag_id)
            VALUES (?, ?)
          `).run(taskId, tag.id);
        }

        // 5. Link task to original decision
        const decisionKey = db.prepare('SELECT id FROM m_context_keys WHERE key = ?').get(mapping.decisionKey) as { id: number } | undefined;
        if (decisionKey) {
          db.prepare(`
            INSERT INTO t_task_decision_links (task_id, decision_key_id)
            VALUES (?, ?)
          `).run(taskId, decisionKey.id);
        }

        details.push(`✓ Created task ${taskId}: ${mapping.taskTitle} (from decision: ${mapping.decisionKey})`);

        // 6. Optionally deprecate original decision
        if (deprecateOriginal && decisionKey) {
          db.prepare(`
            UPDATE t_decisions
            SET status = 2  -- deprecated
            WHERE key_id = ?
          `).run(decisionKey.id);

          details.push(`  → Deprecated original decision: ${mapping.decisionKey}`);
        }
      }

      db.exec('COMMIT');

      return {
        success: true,
        message: `Successfully migrated ${createdTasks.length} decisions to tasks`,
        details,
        mappings,
      };

    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Migration failed: ${message}`,
      details,
    };
  }
}

/**
 * Get migration info
 */
export function getMigrationInfo(): string {
  return `
Migration: Convert Task-Like Decisions to Tasks

This migration detects decisions being used for task/todo tracking
and migrates them to the dedicated task management system.

Detection Heuristics:
- Keys containing: task_, _task, todo_, _todo, wip_, _wip, implement_, fix_
- Tags containing: task, todo, in_progress, wip, blocked, done
- Values containing: TODO:, WIP:, DONE:, BLOCKED:, Status:, [ ], [x]

Features:
- Dry-run mode to preview before executing
- Confidence scoring (0-100%) for each detection
- Links tasks to original decisions for traceability
- Optional deprecation of original decisions
- Adjustable confidence threshold

Usage:
1. Dry-run: migrateDecisionsToTasks(db, true, 50, false)
2. Execute: migrateDecisionsToTasks(db, false, 70, true)
   - minConfidence=70: Only migrate high-confidence detections
   - deprecateOriginal=true: Mark original decisions as deprecated

This migration is safe and reversible via:
- Original decisions remain linked to tasks
- Can be re-run with different confidence thresholds
- Hard-delete function available for manual cleanup
  `.trim();
}
