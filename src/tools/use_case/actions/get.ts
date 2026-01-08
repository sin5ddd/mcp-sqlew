/**
 * Use Case Tool - get Action
 * Get complete use case workflow by ID
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/use-cases/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { UseCaseGetParams, UseCaseResult } from '../types.js';

/**
 * Get complete use case workflow
 * Uses HelpSystemLoader (TOML-based)
 */
export async function getUseCase(
  params: UseCaseGetParams
): Promise<UseCaseResult | { error: string }> {
  const loader = await getHelpLoader();

  const useCase = loader.getUseCase(params.use_case_id);
  if (!useCase) {
    return { error: `Use-case with ID ${params.use_case_id} not found` };
  }

  return {
    use_case_id: useCase.id,
    category: useCase.category,
    title: useCase.title,
    complexity: useCase.complexity,
    description: useCase.description,
    full_example: useCase.full_example,
    action_sequence: useCase.action_sequence.map(s => `${s.tool}:${s.action}`)
  };
}
