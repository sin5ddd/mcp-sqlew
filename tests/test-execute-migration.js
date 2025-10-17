import { initializeDatabase } from './dist/database.js';
import { migrateDecisionsToTasks } from './dist/migrations/migrate-decisions-to-tasks.js';

const db = initializeDatabase('test-migration.db');

console.log('\n=== EXECUTING MIGRATION (confidence >= 70%) ===\n');
const result = migrateDecisionsToTasks(db, false, 70, true);

console.log(`\nResult: ${result.message}\n`);
if (result.details) {
  result.details.forEach(d => console.log(d));
}

// Verify tasks were created
console.log('\n=== Verifying created tasks ===\n');
const tasks = db.prepare('SELECT * FROM v_task_board ORDER BY id').all();
console.log(`Created ${tasks.length} tasks:`);
tasks.forEach(t => {
  console.log(`- Task #${t.id}: ${t.title} [${t.status}] (priority: ${t.priority})`);
  if (t.assigned_to) console.log(`  Assigned to: ${t.assigned_to}`);
  if (t.layer) console.log(`  Layer: ${t.layer}`);
  if (t.tags) console.log(`  Tags: ${t.tags}`);
});

// Check if original decisions were deprecated
console.log('\n=== Checking original decisions status ===\n');
const deprecatedDecisions = db.prepare(`
  SELECT k.key,
    CASE d.status
      WHEN 1 THEN 'active'
      WHEN 2 THEN 'deprecated'
      WHEN 3 THEN 'draft'
    END as status
  FROM t_decisions d
  JOIN m_context_keys k ON d.key_id = k.id
  WHERE k.key LIKE 'task_%' OR k.key LIKE 'todo_%' OR k.key LIKE 'wip_%' OR k.key LIKE '%implement%'
`).all();

deprecatedDecisions.forEach(d => {
  console.log(`- ${d.key}: ${d.status}`);
});

db.close();
