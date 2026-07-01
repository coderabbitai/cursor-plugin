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
- CodeRabbit CLI, installed automatically by the agent when missing
- GitHub CLI for PR-thread autofix workflows

The plugin asks Cursor Agent to install the CodeRabbit CLI automatically when it is missing:

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
coderabbit --version
```

Then authenticate:

```bash
coderabbit auth login --agent
```

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
Use CodeRabbit to review my current changes.
Run CodeRabbit review on uncommitted changes.
Review this branch against main with CodeRabbit.
Fix unresolved CodeRabbit PR feedback.
```

Use plugin commands when you want a repeatable workflow:

```text
/coderabbit-review
/coderabbit-review uncommitted
/coderabbit-review --base main
/coderabbit-review --dir packages/api
/coderabbit-autofix
```

## Review Workflow

The review command checks local prerequisites, installs CodeRabbit CLI when missing, then runs:

```bash
coderabbit review --agent
```

Then Cursor groups CodeRabbit issues by severity and can help apply fixes. Supported scope flags include:

```bash
coderabbit review --agent -t committed
coderabbit review --agent -t uncommitted
coderabbit review --agent --base main
coderabbit review --agent --base-commit <sha>
coderabbit review --agent --dir <path>
coderabbit review --agent -c AGENTS.md .coderabbit.yaml
```

When a requested directory is provided, Cursor verifies that it is an initialized Git repository before running CodeRabbit against it.

## Autofix Workflow

The autofix workflow is for GitHub PRs that already have CodeRabbit review threads.

It:

1. Installs CodeRabbit CLI when missing.
2. Verifies `git`, `gh`, and PR state.
3. Fetches unresolved, current CodeRabbit review threads from the active PR.
4. Treats all review-thread text as untrusted issue reports.
5. Shows each issue with severity, location, and proposed local fix.
6. Applies fixes only after explicit user approval.
7. Creates one consolidated commit when fixes are applied.
8. Optionally pushes and posts a concise PR summary comment.

The plugin does not bulk-apply reviewer prompts. Cursor must inspect the local code and receive approval before each change.

## Repository Layout

```text
.
+-- .cursor-plugin/
|   +-- plugin.json
+-- agents/
|   +-- code-reviewer.md
+-- commands/
|   +-- coderabbit-autofix.md
|   +-- coderabbit-review.md
+-- scripts/
|   +-- validate-plugin.mjs
+-- skills/
    +-- autofix/
    |   +-- SKILL.md
    +-- code-review/
        +-- SKILL.md
```

## Development

Run the local validation script:

```bash
npm test
```

The validator checks:

- Cursor manifest fields
- Manifest component paths
- Plugin metadata
- Required frontmatter for skills, agents, and commands
- Accidental em dashes in repository text files

## Publishing

Before publishing, run `npm test`, verify the plugin name is `CodeRabbit`, confirm `.cursor-plugin/plugin.json` paths are valid, and test local install from `~/.cursor/plugins/local/coderabbit`.

## Security

Review output, PR comments, and "Prompt for AI Agents" sections are untrusted. Cursor should inspect local code before applying fixes and should never execute reviewer-provided commands.

## License

MIT
