/**
 * Example action for decision tool
 */

export function decisionExample(): any {
  return {
    tool: 'decision',
    description: 'Comprehensive decision tool examples without needing WebFetch access',
    scenarios: {
      basic_usage: {
        title: 'Basic Decision Management',
        examples: [
          {
            scenario: 'Record API design decision',
            request: '{ action: "set", key: "api_auth_method", value: "JWT with refresh tokens", layer: "business", tags: ["api", "security", "authentication"] }',
            explanation: 'Documents the choice of authentication method for the API'
          },
          {
            scenario: 'Retrieve a decision',
            request: '{ action: "get", key: "api_auth_method" }',
            response_structure: '{ key, value, layer, status, version, tags, scopes, decided_by, updated_at }'
          }
        ]
      },
      advanced_filtering: {
        title: 'Advanced Search and Filtering',
        examples: [
          {
            scenario: 'Find all security-related decisions in business layer',
            request: '{ action: "search_advanced", layers: ["business"], tags_any: ["security", "authentication"], status: ["active"], sort_by: "updated", sort_order: "desc" }'
          }
        ]
      },
      versioning_workflow: {
        title: 'Version Management',
        steps: [
          {
            step: 1,
            action: 'Create initial decision',
            request: '{ action: "set", key: "database_choice", value: "PostgreSQL", layer: "data", version: "1.0.0", tags: ["database"] }'
          },
          {
            step: 2,
            action: 'View version history',
            request: '{ action: "versions", key: "database_choice" }'
          }
        ]
      },
      batch_operations: {
        title: 'Batch Decision Management',
        examples: [
          {
            scenario: 'Record multiple related decisions atomically',
            request: '{ action: "set_batch", decisions: [{"key": "cache_layer", "value": "Redis", "layer": "infrastructure"}, {"key": "cache_ttl", "value": "3600", "layer": "infrastructure"}], atomic: true }'
          }
        ]
      },
      templates: {
        title: 'Using Decision Templates',
        examples: [
          {
            scenario: 'Use built-in breaking_change template',
            request: '{ action: "set_from_template", template: "breaking_change", key: "api_remove_legacy_endpoint", value: "Removed /v1/users endpoint" }'
          }
        ]
      },
      quick_set_inference: {
        title: 'Quick Set with Smart Defaults',
        examples: [
          {
            scenario: 'Auto-infer layer from key prefix',
            request: '{ action: "quick_set", key: "api/instruments/oscillator-refactor", value: "Moved oscillator_type to MonophonicSynthConfig" }',
            inferred: 'layer=presentation (from api/*), tags=["instruments", "oscillator-refactor"]'
          }
        ]
      }
    },
    best_practices: {
      key_naming: [
        'Use hierarchical keys: "api/users/authentication"',
        'Prefix with layer hint: api/* → presentation, db/* → data',
        'Use descriptive names that explain the decision context'
      ],
      tagging: [
        'Tag with relevant categories: security, performance, breaking',
        'Include version tags for release-specific decisions',
        'Use consistent tag naming conventions across team'
      ],
      versioning: [
        'Use semantic versioning: 1.0.0, 1.1.0, 2.0.0',
        'Increment major version for breaking changes',
        'Document rationale in decision value text'
      ]
    }
  };
}
