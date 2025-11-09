/**
 * Task tool - Kanban Task Watcher
 *
 * Modular implementation split by action
 */

// Export types
export * from './types.js';

// Export actions
export { createTask, createTaskInternal } from './actions/create.js';
export { updateTask } from './actions/update.js';
export { getTask } from './actions/get.js';
export { listTasks } from './actions/list.js';
export { moveTask } from './actions/move.js';
export { linkTask } from './actions/link.js';
export { archiveTask } from './actions/archive.js';
export { createTasksBatch as batchCreateTasks } from './actions/create-batch.js';
export { addDependency } from './actions/add-dependency.js';
export { removeDependency } from './actions/remove-dependency.js';
export { getDependencies } from './actions/get-dependencies.js';
export { watchFiles } from './actions/watch-files.js';
export { getPrunedFiles } from './actions/get-pruned-files.js';
export { linkPrunedFile } from './actions/link-pruned-file.js';

// Export watcher
export { watcherStatus } from './watcher/status.js';

// Export help
export { taskHelp } from './help/help.js';
export { taskExample } from './help/example.js';
export { taskUseCase } from './help/use-case.js';

// Export internal utilities (for testing or advanced usage)
export * from './internal/validation.js';
export * from './internal/state-machine.js';
export * from './internal/task-queries.js';
