/**
 * Topological Sort for Task Dependencies
 *
 * Implements BFS-based topological sorting to determine safe import order for tasks
 * with dependencies. This ensures blocker tasks are imported before blocked tasks,
 * satisfying foreign key constraints in v4_task_dependencies.
 */

import type { TaskDependencyGraph } from '../../types.js';

/**
 * Task dependency record from exported JSON
 */
export interface TaskDependency {
  blocker_task_id: number;
  blocked_task_id: number;
  created_ts: number;
}

/**
 * Build dependency graph from task dependency records
 *
 * @param dependencies - Array of task dependencies from export
 * @param allTaskIds - Set of all task IDs (some tasks may have no dependencies)
 * @returns Dependency graph with adjacency lists
 */
export function buildDependencyGraph(
  dependencies: TaskDependency[],
  allTaskIds: Set<number>
): TaskDependencyGraph {
  const children = new Map<number, number[]>();
  const parents = new Map<number, number[]>();

  // Build adjacency lists
  for (const dep of dependencies) {
    // Add to children map (blocker -> [blocked])
    if (!children.has(dep.blocker_task_id)) {
      children.set(dep.blocker_task_id, []);
    }
    children.get(dep.blocker_task_id)!.push(dep.blocked_task_id);

    // Add to parents map (blocked -> [blockers])
    if (!parents.has(dep.blocked_task_id)) {
      parents.set(dep.blocked_task_id, []);
    }
    parents.get(dep.blocked_task_id)!.push(dep.blocker_task_id);
  }

  // Find roots (tasks that are never blocked)
  const roots = Array.from(allTaskIds).filter(id => !parents.has(id));

  return {
    roots,
    children,
    parents,
    allTaskIds
  };
}

/**
 * Topological sort using BFS (Kahn's algorithm)
 *
 * Ensures tasks are ordered such that all dependencies are satisfied:
 * - A task appears in the sorted list AFTER all tasks it depends on
 * - Blocker tasks appear before blocked tasks
 *
 * @param graph - Dependency graph from buildDependencyGraph
 * @returns Array of task IDs in safe import order
 * @throws Error if circular dependency detected
 */
export function topologicalSort(graph: TaskDependencyGraph): number[] {
  const sorted: number[] = [];
  const visited = new Set<number>();
  const queue: number[] = [...graph.roots];

  while (queue.length > 0) {
    const taskId = queue.shift()!;

    // Skip if already visited (shouldn't happen in DAG, but safety check)
    if (visited.has(taskId)) continue;

    visited.add(taskId);
    sorted.push(taskId);

    // Add children whose dependencies are all satisfied
    const childIds = graph.children.get(taskId) || [];
    for (const childId of childIds) {
      const parentIds = graph.parents.get(childId) || [];

      // Check if all parents (blockers) have been visited
      if (parentIds.every((parentId: number) => visited.has(parentId))) {
        queue.push(childId);
      }
    }
  }

  // Detect circular dependencies
  if (sorted.length < graph.allTaskIds.size) {
    const unvisited = Array.from(graph.allTaskIds).filter(id => !visited.has(id));
    throw new Error(
      `Circular dependency detected in tasks. ` +
      `Cannot determine import order. Unvisited task IDs: ${unvisited.join(', ')}`
    );
  }

  return sorted;
}

/**
 * Sort tasks by dependency order for import
 *
 * High-level function that combines graph building and topological sorting.
 *
 * @param tasks - Array of tasks from export
 * @param dependencies - Array of task dependencies from export
 * @returns Array of tasks sorted in safe import order
 * @throws Error if circular dependency detected
 */
export function sortTasksByDependencies<T extends { id: number }>(
  tasks: T[],
  dependencies: TaskDependency[]
): T[] {
  // Extract all task IDs
  const allTaskIds = new Set(tasks.map(t => t.id));

  // Build dependency graph
  const graph = buildDependencyGraph(dependencies, allTaskIds);

  // Perform topological sort
  const sortedIds = topologicalSort(graph);

  // Map sorted IDs back to task objects
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const sortedTasks = sortedIds
    .map(id => taskMap.get(id))
    .filter((t): t is T => t !== undefined);

  return sortedTasks;
}

/**
 * Validate task dependencies for circular references
 *
 * @param dependencies - Array of task dependencies
 * @param allTaskIds - Set of all valid task IDs
 * @returns Validation result with errors if any
 */
export function validateTaskDependencies(
  dependencies: TaskDependency[],
  allTaskIds: Set<number>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for self-dependencies
  for (const dep of dependencies) {
    if (dep.blocker_task_id === dep.blocked_task_id) {
      errors.push(`Task ${dep.blocker_task_id} cannot depend on itself`);
    }
  }

  // Check for invalid task IDs
  for (const dep of dependencies) {
    if (!allTaskIds.has(dep.blocker_task_id)) {
      errors.push(`Blocker task ${dep.blocker_task_id} not found in task list`);
    }
    if (!allTaskIds.has(dep.blocked_task_id)) {
      errors.push(`Blocked task ${dep.blocked_task_id} not found in task list`);
    }
  }

  // Try to detect circular dependencies
  if (errors.length === 0) {
    try {
      const graph = buildDependencyGraph(dependencies, allTaskIds);
      topologicalSort(graph);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
