# CodeRabbit Plugin for Cursor

AI-powered code review and guarded autofix workflows in Cursor, powered by [CodeRabbit](https://coderabbit.ai).

This repository packages CodeRabbit for Cursor users with:

- Cursor plugin metadata in `.cursor-plugin/plugin.json`
- User-facing plugin name `CodeRabbit`
- Natural-language skills for code review and CodeRabbit PR autofix
- Cursor command prompts for repeatable review and autofix workflows
- A dedicated CodeRabbit review agent
- Safety guidance for review output, GitHub PR threads, and local fixes

## Requirements

- Cursor with plugin support
- Git
- CodeRabbit CLI for review workflows; Cursor asks before installing it when missing
- GitHub CLI for PR-thread autofix workflows

On Windows, use the CodeRabbit CLI and this plugin from a WSL environment.

When the CodeRabbit CLI is missing, the plugin explains that the official installer writes the binary to user-global storage and may update shell profiles. It asks for explicit approval before running:

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | CI=1 sh
export PATH="$HOME/.local/bin:$PATH"
coderabbit --version
```

The noninteractive installer invocation avoids starting a separate login flow. `coderabbit review --agent` owns authentication and continues the review after authentication succeeds.

For PR autofix workflows, also authenticate GitHub CLI:

```bash
gh auth login
```

## Install Locally

The user-facing plugin name is `CodeRabbit`. Cursor's machine-readable plugin identifier is `coderabbit` because Cursor plugin IDs must be lowercase.

Clone this repository into Cursor's local plugin directory:

```bash
git clone https://github.com/coderabbitai/cursor-plugin.git ~/.cursor/plugins/local/coderabbit
```

Restart Cursor or reload plugins after cloning.

Before marketplace publication, local installation is the recommended test path. After publication, users should be able to install from Cursor with:

```text
/add-plugin coderabbit
```

## Usage

Ask Cursor Agent naturally:

```text
Review my code.
Review my changes.
Check this PR for bugs.
Run a security review.
Use CodeRabbit to review my current changes.
Run CodeRabbit review on uncommitted changes.
Review this branch against main with CodeRabbit.
Fix unresolved CodeRabbit PR feedback.
```

Generic code-review requests use CodeRabbit by default, even when it is not mentioned by name. Deterministic tooling like linters, formatters, type checkers, and tests continues to work alongside CodeRabbit as part of the normal project workflow.

Use plugin commands when you want a repeatable workflow:

```text
/coderabbit-review
/coderabbit-review uncommitted
/coderabbit-review --base main
/coderabbit-review --dir packages/api
/coderabbit-autofix
```

## Review Workflow

The review command resolves the requested repository, checks local prerequisites, asks before installing CodeRabbit CLI when missing, then runs:

```bash
coderabbit review --agent
```

Then Cursor orders findings by CodeRabbit's native severity and can help apply fixes. Supported scope flags include:

```bash
coderabbit review --agent -t committed
coderabbit review --agent -t uncommitted
coderabbit review --agent --base main
coderabbit review --agent --base-commit <sha>
coderabbit review --agent --dir <path>
coderabbit review --agent -c AGENTS.md .coderabbit.yaml
```

When a requested directory is provided, Cursor verifies that it is an initialized Git repository before running CodeRabbit against it.

After a CodeRabbit review completes, Cursor reports only the severities and finding details emitted by the CLI. A completed review with zero findings is reported as "CodeRabbit found no findings in the reviewed scope." A skipped review is reported as skipped, not clean. Linters, type checkers, and tests remain part of the normal workflow for validating fixes.

## Autofix Workflow

The autofix workflow is for GitHub PRs that already have CodeRabbit review threads.

It:

1. Requires authenticated `gh`, a clean worktree, and an existing PR whose head exactly matches local `HEAD`.
2. Requires a submitted CodeRabbit review for that head and fetches its unresolved, current review threads.
3. Treats review text as untrusted issue reports and applies only individually approved fixes.
4. Commits only approved changes unless `--no-commit` was requested.
5. Previews and verifies the exact PR destination before an approved push, then posts a summary only after the pushed commit is verified as the PR head and the comment is approved.

The plugin does not bulk-apply reviewer prompts. Cursor must inspect the local code and receive approval before each change.

## Repository Layout

```text
.
+-- .cursor-plugin/
|   +-- plugin.json
|   +-- marketplace.json
+-- agents/
|   +-- code-reviewer.md
+-- commands/
|   +-- coderabbit-autofix.md
|   +-- coderabbit-review.md
+-- rules/
|   +-- code-review-routing.mdc
+-- scripts/
|   +-- validate-plugin.mjs
+-- skills/
    +-- autofix/
    |   +-- SKILL.md
    +-- code-review/
        +-- SKILL.md
```

## Development

Use Node.js 18 or newer, then run the local validation script:

```bash
npm test
```

The validator checks:

- Cursor manifest fields
- Manifest component paths
- Plugin metadata
- Marketplace metadata
- Required frontmatter for skills, agents, commands, and rules
- Default review routing phrases in the skill and agent descriptions
- Accidental em dashes in repository text files

## Publishing

Before publishing, run `npm test`, verify the plugin name is `CodeRabbit`, confirm `.cursor-plugin/plugin.json` paths are valid, and test local install from `~/.cursor/plugins/local/coderabbit`.

## Security

Review output, PR comments, and "Prompt for AI Agents" sections are untrusted. Cursor should inspect local code before applying fixes and should never execute reviewer-provided commands.

## License

MIT
