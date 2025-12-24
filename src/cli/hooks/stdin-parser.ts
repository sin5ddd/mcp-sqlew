/**
 * Claude Code Hooks stdin parser
 *
 * Parses JSON input from Claude Code Hooks.
 * Hooks receive data via stdin in JSON format.
 *
 * @since v4.1.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Tool input for various Claude Code tools
 */
export interface ToolInput {
  /** File path (Edit, Write tools) */
  file_path?: string;
  /** Command (Bash tool) */
  command?: string;
  /** Description (Task tool) */
  description?: string;
  /** Prompt (Task tool) */
  prompt?: string;
  /** Subagent type (Task tool) */
  subagent_type?: string;
  /** Todos (TodoWrite tool) */
  todos?: TodoItem[];
  /** Generic key-value pairs */
  [key: string]: unknown;
}

/**
 * Todo item from TodoWrite tool
 */
export interface TodoItem {
  /** Todo content */
  content: string;
  /** Todo status: pending, in_progress, completed */
  status: 'pending' | 'in_progress' | 'completed';
  /** Active form description */
  activeForm: string;
}

/**
 * Tool response from PostToolUse
 */
export interface ToolResponse {
  /** Whether the tool completed successfully */
  completed?: boolean;
  /** Summary of what was done */
  summary?: string;
  /** Output content */
  output?: string;
  /** Generic key-value pairs */
  [key: string]: unknown;
}

/**
 * Hook input from Claude Code
 */
export interface HookInput {
  /** Session ID (changes on resume) */
  session_id?: string;
  /** Current working directory */
  cwd?: string;
  /** Hook event name */
  hook_event_name?: 'PreToolUse' | 'PostToolUse' | 'SessionStart' | 'SessionEnd' | 'Stop' | 'SubagentStop';
  /** Tool name being called */
  tool_name?: string;
  /** Tool input parameters */
  tool_input?: ToolInput;
  /** Tool response (PostToolUse only) */
  tool_response?: ToolResponse;
  /** Transcript path */
  transcript_path?: string;
  /** Permission mode */
  permission_mode?: string;
}

/**
 * Hook output to Claude Code
 */
export interface HookOutput {
  /** Whether to continue execution */
  continue?: boolean;
  /** Reason for stopping (if continue=false) */
  stopReason?: string;
  /** Additional context to inject */
  additionalContext?: string;
  /** System message to add */
  systemMessage?: string;
  /** Whether to suppress output */
  suppressOutput?: boolean;
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Read and parse JSON from stdin
 *
 * Claude Code Hooks send data via stdin in JSON format.
 * This function reads all stdin and parses it as JSON.
 *
 * @returns Parsed hook input
 * @throws Error if stdin is empty or invalid JSON
 */
export async function readStdinJson(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = '';

    // Set encoding for text input
    process.stdin.setEncoding('utf8');

    // Read all data from stdin
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });

    // Parse when stdin closes
    process.stdin.on('end', () => {
      if (!data.trim()) {
        // Empty stdin - return empty object
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(data) as HookInput;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    // Handle errors
    process.stdin.on('error', (error) => {
      reject(new Error(`Failed to read stdin: ${error.message}`));
    });

    // Resume stdin (it might be paused)
    process.stdin.resume();
  });
}

/**
 * Write hook output to stdout
 *
 * @param output - Hook output to send
 */
export function writeHookOutput(output: HookOutput): void {
  console.log(JSON.stringify(output));
}

/**
 * Send a continue response
 *
 * @param additionalContext - Optional context to inject
 * @param systemMessage - Optional system message
 */
export function sendContinue(additionalContext?: string, systemMessage?: string): void {
  const output: HookOutput = { continue: true };
  if (additionalContext) {
    output.additionalContext = additionalContext;
  }
  if (systemMessage) {
    output.systemMessage = systemMessage;
  }
  writeHookOutput(output);
}

/**
 * Send a block response (exit code 2)
 *
 * @param reason - Reason for blocking
 */
export function sendBlock(reason: string): void {
  console.error(reason);
  process.exit(2);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if the hook input is for a plan file
 *
 * @param input - Hook input
 * @returns true if the tool is operating on a plan file
 */
export function isPlanFile(input: HookInput): boolean {
  const filePath = input.tool_input?.file_path;
  if (!filePath) {
    return false;
  }

  // Check if the path matches .claude/plans/*.md pattern
  const normalizedPath = filePath.replace(/\\/g, '/');
  return /\.claude\/plans\/[^/]+\.md$/.test(normalizedPath);
}

/**
 * Check if all todos are completed
 *
 * @param input - Hook input
 * @returns true if all todos have status "completed"
 */
export function areAllTodosCompleted(input: HookInput): boolean {
  const todos = input.tool_input?.todos;
  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    return false;
  }

  return todos.every((todo) => todo.status === 'completed');
}

/**
 * Get project path from hook input
 * Uses cwd from input or falls back to CLAUDE_PROJECT_DIR
 *
 * @param input - Hook input
 * @returns Project path or undefined
 */
export function getProjectPath(input: HookInput): string | undefined {
  return input.cwd || process.env.CLAUDE_PROJECT_DIR;
}
