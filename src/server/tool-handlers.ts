/**
 * MCP Server - Tool Call Handlers
 * Processes CallToolRequest and dispatches to appropriate tool actions
 */

import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAdapter } from '../database.js';
import {
  setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer,
  quickSetDecision, searchAdvanced, setDecisionBatch, hasUpdates, setFromTemplate,
  createTemplate, listTemplates, hardDeleteDecision, addDecisionContextAction,
  listDecisionContextsAction, decisionHelp, decisionExample
} from '../tools/context/index.js';
import {
  recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch, sqliteFlush, fileHelp, fileExample
} from '../tools/files/index.js';
import {
  addConstraint, getConstraints, deactivateConstraint, constraintHelp, constraintExample
} from '../tools/constraints/index.js';
import {
  createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask,
  batchCreateTasks, addDependency, removeDependency, getDependencies, watchFiles,
  getPrunedFiles, linkPrunedFile, taskHelp, taskExample, taskUseCase, watcherStatus
} from '../tools/tasks.js';
import {
  queryAction, queryParams, queryTool, workflowHints, batchGuide, errorRecovery,
  helpHelp, helpExample
} from '../tools/help/index.js';
import {
  getUseCase, searchUseCases, listAllUseCases, useCaseHelp, useCaseExample
} from '../tools/use_case/index.js';
import {
  getExample, searchExamples, listAllExamples, exampleHelp, exampleExample
} from '../tools/example/index.js';
import { trackAndReturnHelp } from '../utils/help-tracking.js';
import {
  queryHelpAction, queryHelpParams, queryHelpTool, queryHelpUseCase,
  queryHelpListUseCases, queryHelpNextActions
} from '../tools/help-queries.js';
import { debugLogToolCall, debugLogToolResponse } from '../utils/debug-logger.js';
import { handleToolError } from '../utils/error-handler.js';
import { DecisionAction, TaskAction, FileAction, ConstraintAction, ExampleAction } from '../types.js';

/**
 * Handle CallToolRequest - dispatch to appropriate tool action
 */
export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  const { name, arguments: args } = request.params;
  const params = args as any;
  const action = params.action || 'N/A';

  // Debug logging: Tool call
  debugLogToolCall(name, action, params);

  try {
    let result;

    switch (name) {
      case 'decision': {
        const action = params.action as DecisionAction;
        switch (action) {
          case 'set': result = await setDecision(params); break;
          case 'get': result = await getDecision(params); break;
          case 'list': result = await getContext(params); break;
          case 'search_tags': result = await searchByTags({ tags: params.tags, match_mode: params.tag_match, status: params.status, layer: params.layer }); break;
          case 'search_layer': result = await searchByLayer({ layer: params.layer, status: params.status, include_tags: params.include_tags }); break;
          case 'versions': result = await getVersions(params); break;
          case 'quick_set': result = await quickSetDecision(params); break;
          case 'search_advanced': result = await searchAdvanced({
            layers: params.layers,
            tags_all: params.tags_all,
            tags_any: params.tags_any,
            exclude_tags: params.exclude_tags,
            scopes: params.scopes,
            updated_after: params.updated_after,
            updated_before: params.updated_before,
            decided_by: params.decided_by,
            statuses: params.statuses,
            search_text: params.search_text,
            sort_by: params.sort_by,
            sort_order: params.sort_order,
            limit: params.limit,
            offset: params.offset
          }); break;
          case 'set_batch': {
            // MCP client serializes arrays as JSON strings - parse if needed
            let decisions = params.decisions;
            if (typeof decisions === 'string') {
              try {
                decisions = JSON.parse(decisions);
              } catch (error) {
                throw new Error(`Invalid JSON in "decisions" parameter: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            result = await setDecisionBatch({ decisions, atomic: params.atomic });
            break;
          }
          case 'has_updates': result = await hasUpdates({ agent_name: params.agent_name, since_timestamp: params.since_timestamp }); break;
          case 'set_from_template': result = await setFromTemplate(params); break;
          case 'create_template': result = await createTemplate(params); break;
          case 'list_templates': result = await listTemplates(params); break;
          case 'hard_delete': result = await hardDeleteDecision(params); break;
          case 'add_decision_context': result = await addDecisionContextAction(params); break;
          case 'list_decision_contexts': result = await listDecisionContextsAction(params); break;
          case 'help':
            const helpContent = decisionHelp();
            trackAndReturnHelp('decision', 'help', JSON.stringify(helpContent));
            result = helpContent;
            break;
          case 'example':
            const exampleContent = decisionExample();
            trackAndReturnHelp('decision', 'example', JSON.stringify(exampleContent));
            result = exampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'file': {
        const action = params.action as FileAction;
        switch (action) {
          case 'record': result = await recordFileChange(params); break;
          case 'get': result = await getFileChanges(params); break;
          case 'check_lock': result = await checkFileLock(params); break;
          case 'record_batch': {
            // MCP client serializes arrays as JSON strings - parse if needed
            let file_changes = params.file_changes;
            if (typeof file_changes === 'string') {
              try {
                file_changes = JSON.parse(file_changes);
              } catch (error) {
                throw new Error(`Invalid JSON in "file_changes" parameter: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            result = await recordFileChangeBatch({ file_changes, atomic: params.atomic });
            break;
          }
          case 'sqlite_flush': result = await sqliteFlush(); break;
          case 'help':
            const fileHelpContent = fileHelp();
            trackAndReturnHelp('file', 'help', JSON.stringify(fileHelpContent));
            result = fileHelpContent;
            break;
          case 'example':
            const fileExampleContent = fileExample();
            trackAndReturnHelp('file', 'example', JSON.stringify(fileExampleContent));
            result = fileExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'constraint': {
        const action = params.action as ConstraintAction;
        switch (action) {
          case 'add': result = await addConstraint(params); break;
          case 'get': result = await getConstraints(params); break;
          case 'deactivate': result = await deactivateConstraint(params); break;
          case 'help':
            const constraintHelpContent = constraintHelp();
            trackAndReturnHelp('constraint', 'help', JSON.stringify(constraintHelpContent));
            result = constraintHelpContent;
            break;
          case 'example':
            const constraintExampleContent = constraintExample();
            trackAndReturnHelp('constraint', 'example', JSON.stringify(constraintExampleContent));
            result = constraintExampleContent;
            break;
          case 'use_case':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'task': {
        const action = params.action as TaskAction;
        switch (action) {
          case 'create': result = await createTask(params); break;
          case 'update': result = await updateTask(params); break;
          case 'get': result = await getTask(params); break;
          case 'list': result = await listTasks(params); break;
          case 'move': result = await moveTask(params); break;
          case 'link': result = await linkTask(params); break;
          case 'archive': result = await archiveTask(params); break;
          case 'create_batch': {
            // MCP client serializes arrays as JSON strings - parse if needed
            let tasks = params.tasks;
            if (typeof tasks === 'string') {
              try {
                tasks = JSON.parse(tasks);
              } catch (error) {
                throw new Error(`Invalid JSON in "tasks" parameter: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            result = await batchCreateTasks({ tasks, atomic: params.atomic });
            break;
          }
          case 'add_dependency': result = await addDependency(params); break;
          case 'remove_dependency': result = await removeDependency(params); break;
          case 'get_dependencies': result = await getDependencies(params); break;
          case 'watch_files': result = await watchFiles(params); break;
          case 'get_pruned_files': result = await getPrunedFiles(params); break;
          case 'link_pruned_file': result = await linkPrunedFile(params); break;
          case 'watcher': result = await watcherStatus(params); break;
          case 'help':
            const taskHelpContent = taskHelp();
            trackAndReturnHelp('task', 'help', JSON.stringify(taskHelpContent));
            result = taskHelpContent;
            break;
          case 'example':
            const taskExampleContent = taskExample();
            trackAndReturnHelp('task', 'example', JSON.stringify(taskExampleContent));
            result = taskExampleContent;
            break;
          case 'use_case':
            const taskUseCaseContent = taskUseCase();
            trackAndReturnHelp('task', 'use_case', JSON.stringify(taskUseCaseContent));
            result = taskUseCaseContent;
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'help': {
        const action = params.action as string;
        switch (action) {
          case 'query_action':
            if (!params.tool || !params.target_action) {
              result = { error: 'Parameters "tool" and "target_action" are required for query_action' };
            } else {
              result = await queryAction({ action: 'query_action', tool: params.tool, target_action: params.target_action });
            }
            break;
          case 'query_params':
            if (!params.tool || !params.target_action) {
              result = { error: 'Parameters "tool" and "target_action" are required for query_params' };
            } else {
              result = await queryParams({ action: 'query_params', tool: params.tool, target_action: params.target_action });
            }
            break;
          case 'query_tool':
            if (!params.tool) {
              result = { error: 'Parameter "tool" is required for query_tool' };
            } else {
              result = await queryTool({ action: 'query_tool', tool: params.tool });
            }
            break;
          case 'workflow_hints':
            if (!params.tool || !params.current_action) {
              result = { error: 'Parameters "tool" and "current_action" are required for workflow_hints' };
            } else {
              result = await workflowHints({ action: 'workflow_hints', tool: params.tool, current_action: params.current_action });
            }
            break;
          case 'batch_guide':
            if (!params.operation) {
              result = { error: 'Parameter "operation" is required for batch_guide' };
            } else {
              result = await batchGuide({ action: 'batch_guide', operation: params.operation });
            }
            break;
          case 'error_recovery':
            if (!params.error_message) {
              result = { error: 'Parameter "error_message" is required for error_recovery' };
            } else {
              result = await errorRecovery({
                action: 'error_recovery',
                error_message: params.error_message,
                tool: params.tool
              });
            }
            break;
          case 'help':
            const helpHelpContent = helpHelp();
            trackAndReturnHelp('help', 'help', JSON.stringify(helpHelpContent));
            result = helpHelpContent;
            break;
          case 'example':
            const helpExampleContent = helpExample();
            trackAndReturnHelp('help', 'example', JSON.stringify(helpExampleContent));
            result = helpExampleContent;
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'example': {
        const action = params.action as ExampleAction;
        switch (action) {
          case 'get':
            result = await getExample({
              action: 'get',
              tool: params.tool,
              action_name: params.action_name,
              topic: params.topic
            });
            break;
          case 'search':
            if (!params.keyword) {
              result = { error: 'Parameter "keyword" is required for search' };
            } else {
              result = await searchExamples({
                action: 'search',
                keyword: params.keyword,
                tool: params.tool,
                action_name: params.action_name,
                complexity: params.complexity
              });
            }
            break;
          case 'list_all':
            result = await listAllExamples({
              action: 'list_all',
              tool: params.tool,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          case 'help':
            const exampleHelpContent = exampleHelp();
            trackAndReturnHelp('example', 'help', JSON.stringify(exampleHelpContent));
            result = exampleHelpContent;
            break;
          case 'example':
            const exampleExampleContent = exampleExample();
            trackAndReturnHelp('example', 'example', JSON.stringify(exampleExampleContent));
            result = exampleExampleContent;
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      case 'use_case': {
        const action = params.action as string;
        switch (action) {
          case 'get':
            if (!params.use_case_id) {
              result = { error: 'Parameter "use_case_id" is required for get' };
            } else {
              result = await getUseCase({ action: 'get', use_case_id: params.use_case_id });
            }
            break;
          case 'search':
            if (!params.keyword) {
              result = { error: 'Parameter "keyword" is required for search' };
            } else {
              result = await searchUseCases({
                action: 'search',
                keyword: params.keyword,
                category: params.category,
                complexity: params.complexity
              });
            }
            break;
          case 'list_all':
            result = await listAllUseCases({
              action: 'list_all',
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          case 'help':
            const useCaseHelpContent = useCaseHelp();
            trackAndReturnHelp('use_case', 'help', JSON.stringify(useCaseHelpContent));
            result = useCaseHelpContent;
            break;
          case 'example':
            const useCaseExampleContent = useCaseExample();
            trackAndReturnHelp('use_case', 'example', JSON.stringify(useCaseExampleContent));
            result = useCaseExampleContent;
            break;
          default: throw new Error(`Unknown action: ${action}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Debug logging: Success
    debugLogToolResponse(name, action, true, result);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    // Use centralized error handler (stack goes to logs only, not returned to client)
    const errorResult = handleToolError(name, action, error, params);

    // Check if this is a structured validation error or a simple message
    const errorResponse = errorResult.message !== undefined
      ? { error: errorResult.message }  // Regular error: wrap message
      : errorResult;  // Validation error: use structured object as-is

    debugLogToolResponse(name, action, false, undefined, errorResponse);

    return {
      content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }
}
