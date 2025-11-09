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
  sendMessage, getMessages, markRead, sendMessageBatch, messageHelp, messageExample
} from '../tools/messaging.js';
import {
  recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch, fileHelp, fileExample
} from '../tools/files/index.js';
import {
  addConstraint, getConstraints, deactivateConstraint, constraintHelp, constraintExample
} from '../tools/constraints/index.js';
import {
  getLayerSummary, clearOldData, getStats, getActivityLog, flushWAL, statsHelp, statsExample
} from '../tools/stats/index.js';
import {
  createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask,
  batchCreateTasks, addDependency, removeDependency, getDependencies, watchFiles,
  getPrunedFiles, linkPrunedFile, taskHelp, taskExample, taskUseCase, watcherStatus
} from '../tools/tasks.js';
import { trackAndReturnHelp } from '../utils/help-tracking.js';
import {
  queryHelpAction, queryHelpParams, queryHelpTool, queryHelpUseCase,
  queryHelpListUseCases, queryHelpNextActions
} from '../tools/help-queries.js';
import { debugLogToolCall, debugLogToolResponse } from '../utils/debug-logger.js';
import { handleToolError } from '../utils/error-handler.js';
import { DecisionAction, TaskAction, FileAction, ConstraintAction, StatsAction, MessageAction } from '../types.js';

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
          case 'set_batch': result = await setDecisionBatch({ decisions: params.decisions, atomic: params.atomic }); break;
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

      case 'message': {
        const action = params.action as MessageAction;
        switch (action) {
          case 'send': result = await sendMessage(params); break;
          case 'get': result = await getMessages(params); break;
          case 'mark_read': result = await markRead(params); break;
          case 'send_batch': result = await sendMessageBatch({ messages: params.messages, atomic: params.atomic }); break;
          case 'help':
            const msgHelpContent = messageHelp();
            trackAndReturnHelp('message', 'help', JSON.stringify(msgHelpContent));
            result = msgHelpContent;
            break;
          case 'example':
            const msgExampleContent = messageExample();
            trackAndReturnHelp('message', 'example', JSON.stringify(msgExampleContent));
            result = msgExampleContent;
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
          case 'record_batch': result = await recordFileChangeBatch({ file_changes: params.file_changes, atomic: params.atomic }); break;
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

      case 'stats': {
        const action = params.action as StatsAction;
        switch (action) {
          case 'layer_summary': result = await getLayerSummary(); break;
          case 'db_stats': result = await getStats(); break;
          case 'clear': result = await clearOldData(params); break;
          case 'activity_log': result = await getActivityLog({
            since: params.since,
            agent_names: params.agent_names,
            actions: params.actions,
            limit: params.limit,
          }); break;
          case 'flush': result = await flushWAL(); break;
          case 'help_action':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpAction(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help_params':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpParams(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help_tool':
            if (!params.tool) {
              result = { error: 'Parameter "tool" is required' };
            } else {
              result = await queryHelpTool(getAdapter(), params.tool);
            }
            break;
          case 'help_use_case':
            if (!params.use_case_id) {
              result = { error: 'Parameter "use_case_id" is required' };
            } else {
              result = await queryHelpUseCase(getAdapter(), params.use_case_id);
            }
            break;
          case 'help_list_use_cases':
            result = await queryHelpListUseCases(getAdapter(), {
              category: params.category,
              complexity: params.complexity,
              limit: params.limit,
              offset: params.offset
            });
            break;
          case 'help_next_actions':
            if (!params.target_tool || !params.target_action) {
              result = { error: 'Parameters "target_tool" and "target_action" are required' };
            } else {
              result = await queryHelpNextActions(getAdapter(), params.target_tool, params.target_action);
            }
            break;
          case 'help':
            const statsHelpContent = statsHelp();
            trackAndReturnHelp('stats', 'help', JSON.stringify(statsHelpContent));
            result = statsHelpContent;
            break;
          case 'example':
            const statsExampleContent = statsExample();
            trackAndReturnHelp('stats', 'example', JSON.stringify(statsExampleContent));
            result = statsExampleContent;
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
          case 'batch_create': result = await batchCreateTasks({ tasks: params.tasks, atomic: params.atomic }); break;
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
