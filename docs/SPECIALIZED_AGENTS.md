# Specialized Agents for sqlew

Production-ready agent templates for efficient multi-agent coordination using the mcp-sqlew MCP server.

## Table of Contents
- [Overview](#overview)
- [Available Agents](#available-agents)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Token Optimization](#token-optimization)
- [Agent Comparison](#agent-comparison)
- [Customization](#customization)
- [Integration](#integration)
- [Troubleshooting](#troubleshooting)

## Overview

These specialized agents leverage sqlew's token-efficient context management to coordinate complex development workflows, document architectural decisions, and maintain project knowledge.

### Why Use All Three Agents?

**These agents are complementary specialists, not redundant features.**

Each agent has **unique capabilities** the others lack:

- **Scrum Master** = Coordination specialist (creates tasks, manages dependencies, coordinates agents)
- **Researcher** = Analysis specialist (queries history, identifies patterns, cross-references decisions)
- **Architect** = Documentation specialist (rich decision records, constraint engineering, architectural frameworks)

**Example**: Implementing OAuth2 authentication

**❌ Using only Scrum Master**:
- Creates tasks ✅
- Tracks progress ✅
- Documents decision? "We chose OAuth2" (shallow, no rationale)
- Analyzes past decisions? (Limited capability)

**✅ Using all three together**:
1. **Architect**: Documents decision with full rationale, alternatives (OAuth2 vs JWT vs sessions), tradeoffs, creates constraints
2. **Scrum Master**: Creates sprint plan, establishes task dependencies, coordinates agents
3. **Researcher**: Finds related past auth decisions, prevents duplicating solved problems

**Recommendation**: Use all three agents for complete development coordination. The 46KB token cost is justified by the comprehensive capabilities you gain.

### Token Optimization (If Needed)

If you must reduce token consumption, understand what you're giving up:

- **Remove Researcher** (saves 14KB): Lose historical analysis, pattern detection, decision evolution tracking
- **Remove Architect** (saves 20KB): Lose rich decision documentation, constraint enforcement, architectural frameworks
- **Remove Scrum Master** (saves 12KB): Lose task coordination, dependency management, agent orchestration

Only optimize if you have specific workflow constraints (e.g., solo developer doing simple tasks).

## Available Agents

**Note**: Invoke agents using the `@` prefix: `@sqlew-scrum-master`, `@sqlew-researcher`, `@sqlew-architect`

### 🟣 Scrum Master (`sqlew-scrum-master.md`)

**Purpose**: Multi-agent coordination, task management, sprint planning

**Use when**:
- Starting a new feature sprint
- Breaking down complex work into manageable tasks
- Managing task dependencies and blockers
- Coordinating parallel work across multiple agents
- Tracking sprint progress

**Key Capabilities**:
- Create tasks with dependencies using `batch_create`
- Assign specialized agents to tasks
- Monitor progress via `stats.layer_summary`
- Detect stale tasks and blockers
- Facilitate inter-agent messaging

**Token Budget**: ~12KB per conversation | 5-15k tokens per sprint planning session

---

### 🔵 Researcher (`sqlew-researcher.md`)

**Purpose**: Query historical context, analyze patterns, extract insights

**Use when**:
- Understanding past architectural decisions
- Investigating "why was this decided?"
- Onboarding new team members
- Sprint retrospective analysis
- Finding related decisions/constraints

**Key Capabilities**:
- Search decisions by tags, layers, context keys
- Retrieve constraint rationale
- Analyze task completion patterns
- Track decision version history
- Cross-reference decisions ↔ tasks ↔ files

**Token Budget**: ~14KB per conversation | 2-8k tokens per research session

---

### 🟢 Architect (`sqlew-architect.md`)

**Purpose**: Document decisions, enforce constraints, maintain standards

**Use when**:
- Making architectural choices (technology, patterns, designs)
- Establishing enforceable coding standards
- Validating compliance with constraints
- Recording design rationale for future reference
- Analyzing tradeoffs between alternatives

**Key Capabilities**:
- Create rich decision records (rationale, alternatives, tradeoffs)
- Establish constraints linked to decisions
- Use decision-making frameworks (SWOT, cost-benefit)
- Validate architectural compliance
- Document decision evolution via `add_decision_context`

**Token Budget**: ~20KB per conversation | 3-10k tokens per decision documentation session

## Installation

### Step 1: Configure Which Agents to Install

Agents are configured via `.sqlew/config.toml` in your project root.

**Recommended: Install all three agents** (they are complementary specialists):

```toml
# Edit .sqlew/config.toml
[agents]
scrum_master = true   # Coordination specialist (12KB)
researcher = true     # Analysis specialist (14KB)
architect = true      # Documentation specialist (20KB)
```

If the config file doesn't exist, create it:

```bash
# Create .sqlew directory
mkdir -p .sqlew

# Create config.toml with agent configuration
cat > .sqlew/config.toml << 'EOF'
[agents]
scrum_master = true
researcher = true
architect = true
EOF
```

**Full example with all options**: See `.sqlew/config.example.toml` in the mcp-sqlew repository.

**Note**: Agents configured as `true` are automatically copied to your project's `.claude/agents/` directory.

### Step 2: Verify Installation

```bash
ls .claude/agents/sqlew-*.md
# Should show: sqlew-scrum-master.md, sqlew-researcher.md, sqlew-architect.md
```

### Step 3: Use Agents

Invoke agents in Claude Code using the `@` prefix:

```
@sqlew-scrum-master "Plan the sprint for OAuth2 implementation"
@sqlew-researcher "What past auth decisions have we made?"
@sqlew-architect "Document the OAuth2 vs JWT decision"
```

## Configuration

### Agent Selection Configuration

**Default (Recommended): All agents enabled**

```toml
# .sqlew/config.toml
[agents]
scrum_master = true   # Coordination specialist (12KB)
researcher = true     # Analysis specialist (14KB)
architect = true      # Documentation specialist (20KB)
# Total: 46KB tokens - comprehensive development coordination
```

**Only if you have specific constraints**, you can disable agents:

```toml
[agents]
scrum_master = true   # Keep coordination
researcher = false    # Skip (lose historical analysis)
architect = false     # Skip (lose rich decision docs)
# Total: 12KB tokens - minimal task tracking only
```

**Note**: Agent files are automatically managed based on your config settings.

### Configuration File Location

- **Project-specific**: `.sqlew/config.toml` in project root
- **Created automatically**: On first MCP server run if not exists
- **Full example**: `.sqlew/config.example.toml`

### Config Options

```toml
[agents]
# Scrum Master: Multi-agent coordination, task management, sprint planning
# Token cost: ~12KB per conversation when loaded in Claude Code
# Use when: Coordinating complex features, managing dependencies
scrum_master = true

# Researcher: Query decisions, analyze patterns, investigate context
# Token cost: ~14KB per conversation when loaded in Claude Code
# Use when: Understanding past decisions, onboarding, retrospectives
researcher = true

# Architect: Document decisions, enforce constraints, maintain standards
# Token cost: ~20KB per conversation when loaded in Claude Code
# Use when: Making architectural choices, establishing rules
architect = true
```

## Usage Examples

**Note**: Invoke agents in Claude Code using the `@` prefix (e.g., `@sqlew-scrum-master`).

### Example 1: New Feature Sprint

```
User: "We need to implement a notification system with email, push, and in-app."

@sqlew-scrum-master "Create sprint plan for notification feature"
```

**Agent creates**:
- Task #1: Design notification schema (ARCHITECTURE, HIGH)
- Task #2: Implement message queue (IMPLEMENTATION, CRITICAL)
- Task #3-5: Email/Push/In-app handlers (IMPLEMENTATION)
- Task #6: Integration tests (TESTING)

**Agent establishes dependencies**:
- T2 depends on T1 (need schema first)
- T3-5 depend on T2 (need queue infrastructure)
- T6 depends on T3-5 (test complete system)

### Example 2: Document Architectural Decision

```
User: "We decided to use Redis instead of RabbitMQ for notifications."

@sqlew-architect "Document this decision with full rationale"
```

**Agent creates**:
```
Decision: notification-queue-redis
Rationale: Team familiarity, simpler ops, built-in persistence
Alternatives: RabbitMQ (more features), SQS (vendor lock-in), Kafka (overkill)
Tradeoffs: Less routing, manual retries, but operational simplicity

Constraints:
- All notifications MUST use Redis Streams
- Consumer groups MUST ack within 30s
```

### Example 3: Investigate Past Decision

```
User: "Why did we choose JWT over sessions?"

@sqlew-researcher "Find authentication decisions"
```

**Agent retrieves**:
```
Decision: auth-jwt-strategy (2024-09-15)
Rationale: Stateless for horizontal scaling, mobile-ready, industry standard
Alternatives: Session cookies (simpler revocation but sticky sessions needed)
Tradeoffs: Token revocation complexity vs. scalability

Related Constraints:
- JWT tokens MUST expire within 15 minutes
- Refresh tokens in httpOnly cookies only
```

### Example 4: Sprint Progress Check

```
User: "Show me current sprint status"

@sqlew-scrum-master "Generate sprint report"
```

**Agent shows**:
```
📊 Sprint Summary (Week of 2024-10-20)

ARCHITECTURE: TODO: 0 | IN_PROGRESS: 1 | DONE: 2
IMPLEMENTATION: TODO: 3 | IN_PROGRESS: 2 | DONE: 1
TESTING: TODO: 1 | IN_PROGRESS: 0 | DONE: 0

🚨 Blockers:
- Task #1 IN_PROGRESS for 2 days (may be stale)

📈 Next Actions:
1. Check Task #1 status
2. Complete Task #2 to unblock T3-5
```

## Token Optimization

### Token Impact by Configuration

| Configuration | Tokens Loaded | Use Case |
|--------------|---------------|----------|
| All 3 agents | 46KB | Full-featured coordination |
| Scrum + Architect | 32KB | Common setup (tasks + decisions) |
| Scrum + Researcher | 26KB | Task management + history |
| Scrum only | 12KB | Minimal (task tracking only) |
| Architect only | 20KB | Decision documentation only |

### Recommended Configurations

**Full Team (All Features)**:
```toml
scrum_master = true   # 12KB
researcher = true     # 14KB
architect = true      # 20KB
# Total: 46KB
```

**Solo Developer (Task Focus)**:
```toml
scrum_master = true   # 12KB
researcher = false
architect = false
# Total: 12KB (74% savings)
```

**Architecture-Focused**:
```toml
scrum_master = false
researcher = true     # 14KB
architect = true      # 20KB
# Total: 34KB (26% savings)
```

## Agent Comparison

| Feature | Scrum Master | Researcher | Architect |
|---------|--------------|------------|-----------|
| **Creates Tasks** | ✅ Primary | ❌ | ❌ |
| **Creates Decisions** | ⚠️ Basic | ❌ | ✅ Primary |
| **Creates Constraints** | ❌ | ❌ | ✅ Primary |
| **Queries History** | ⚠️ Task-focused | ✅ Primary | ⚠️ Validation |
| **Coordinates Agents** | ✅ Primary | ❌ | ❌ |
| **Documents Rationale** | ❌ | ❌ | ✅ Primary |
| **Analyzes Patterns** | ⚠️ Task patterns | ✅ Primary | ⚠️ Decision patterns |

**Legend**: ✅ Primary use case | ⚠️ Secondary capability | ❌ Not designed for

## Customization

### Adapt to Your Project

Edit agent files in `~/.claude/agents/` to customize:

**1. Layer Taxonomy**:
```markdown
## Your Project's Layers
- **STRATEGY**: Business-level decisions
- **ARCHITECTURE**: System design
- **PLATFORM**: Infrastructure
- **APPLICATION**: Feature implementation
```

**2. Tag Conventions**:
```markdown
## Your Project's Tags
- Technology: rust, typescript, react, postgresql
- Domain: auth, payments, notifications
- Cross-cutting: security, performance
```

**3. Priority Rules**:
```markdown
## Your Priority Criteria
- CRITICAL: System breaks, security issues
- HIGH: Major features, blocking issues
- MEDIUM: Enhancements, non-blocking
- LOW: Nice-to-have, cosmetic
```

## Integration

### Git Commit Hooks

Link tasks to commits:

```bash
# .git/hooks/prepare-commit-msg
#!/bin/bash
BRANCH=$(git symbolic-ref --short HEAD)
if [[ $BRANCH =~ ^task/([0-9]+) ]]; then
  TASK_ID="${BASH_REMATCH[1]}"
  echo "Task #$TASK_ID: $(cat $1)" > $1
fi
```

### CI/CD Integration

Validate constraints in CI:

```yaml
# .github/workflows/constraint-check.yml
name: Constraint Validation
on: [pull_request]
jobs:
  check-constraints:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check architectural constraints
        run: |
          # Query active constraints
          # Run validators based on constraint rules
```

### PR Templates

```markdown
## Pull Request - Task #X

**Related Decision**: [context_key if applicable]

**Constraints Checked**:
- [ ] Constraint #Y: [description]
- [ ] Constraint #Z: [description]

**Architectural Impact**: None | Minor | Major
[If Major: @sqlew-architect document new decision]
```

## Troubleshooting

### Agent Not Responding

**Problem**: Agent doesn't activate when called

**Solution**:
```bash
# Check agent file location
ls ~/.claude/agents/sqlew-*.md

# Verify frontmatter is valid YAML
head -n 10 ~/.claude/agents/sqlew-scrum-master.md

# Restart Claude Code
```

### Config Not Found

**Problem**: Config file missing

**Solution**:
```bash
# Verify config exists
cat .sqlew/config.toml

# If missing, create it manually
mkdir -p .sqlew
cat > .sqlew/config.toml << 'EOF'
[agents]
scrum_master = true
researcher = true
architect = true
EOF

# Or copy from example
cp node_modules/sqlew/assets/config.example.toml .sqlew/config.toml
```

### Too Many Tokens

**Problem**: Conversations consume too many tokens

**Solution**:
1. Edit `.sqlew/config.toml` and disable unused agents (set to `false`)
2. Restart Claude Code

Agent files are automatically managed based on your config.

**Example**:
```toml
[agents]
scrum_master = true   # Keep
researcher = false    # Disable (saves 14KB)
architect = false     # Disable (saves 20KB)
```

### Wrong Agents Installed

**Problem**: You have agents you don't want, or missing agents you need

**Solution**:
1. Edit `.sqlew/config.toml` to set desired agents to `true` and unwanted agents to `false`
2. Restart Claude Code

Agent files are automatically synchronized with your config settings.

**Example**:
```toml
[agents]
scrum_master = true   # This will be installed
researcher = false    # This will not be installed
architect = true      # This will be installed
```

## Best Practices

### DO ✅

- Use scrum-master for coordination, specialized agents for implementation
- Create rich decision records (rationale + alternatives + tradeoffs)
- Establish enforceable constraints linked to decisions
- Query researcher before creating duplicate decisions
- Use batch operations for token efficiency
- Assign specialized agents explicitly (avoid generic pool bloat)

### DON'T ❌

- Don't use scrum-master for actual coding (delegate)
- Don't create decisions without rationale/alternatives
- Don't query `m_agents` for "what did agent X do" (use task metadata)
- Don't leave tasks IN_PROGRESS indefinitely
- Don't re-query identical data (agents remember conversation context)

## File Manifest

Agent files in `assets/sample-agents/`:

```
assets/sample-agents/
├── sqlew-scrum-master.md       # Task coordination agent
├── sqlew-researcher.md         # Context query agent
└── sqlew-architect.md          # Decision documentation agent
```

## Version

**v1.0.0** - Initial release (2024-10-28)
- Enhanced scrum-master with token optimization and error recovery
- Researcher with query patterns and cross-reference capabilities
- Architect with decision frameworks and constraint engineering

## Resources

- **Sqlew Documentation**: [/docs](/docs) in mcp-sqlew repository
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Claude Code**: https://docs.claude.com/claude-code
- **Tool Reference**: [/docs/TOOL_REFERENCE.md](/docs/TOOL_REFERENCE.md)

## Support

- **Issues**: https://github.com/sin5ddd/mcp-sqlew/issues
- **Discussions**: https://github.com/sin5ddd/mcp-sqlew/discussions

---

**Built for token-efficient multi-agent coordination** 🚀
