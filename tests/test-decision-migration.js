import { initializeDatabase } from './dist/database.js';
import { migrateDecisionsToTasks, detectTaskLikeDecisions } from './dist/migrations/migrate-decisions-to-tasks.js';

const db = initializeDatabase('test-migration.db');

console.log('\n=== DRY RUN: Detecting task-like decisions ===\n');
const mappings = detectTaskLikeDecisions(db, 50);

console.log(`Found ${mappings.length} task-like decisions:\n`);
mappings.forEach((m, i) => {
  console.log(`${i + 1}. "${m.decisionKey}" → "${m.taskTitle}"`);
  console.log(`   Status: ${m.status}, Priority: ${m.priority}, Confidence: ${m.confidence}%`);
  console.log(`   Reasons: ${m.detectionReasons.join(', ')}`);
  console.log(`   Tags: ${m.tags.join(', ')}`);
  console.log('');
});

console.log('\n=== Running migration (dry-run=true) ===\n');
const dryRunResult = migrateDecisionsToTasks(db, true, 50, false);
console.log(JSON.stringify(dryRunResult, null, 2));

db.close();
