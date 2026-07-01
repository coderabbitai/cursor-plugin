---
name: coderabbit-review
description: Run CodeRabbit code review on the current repository.
argument-hint: "[all|committed|uncommitted] [--base <branch>] [--base-commit <sha>] [--dir <path>]"
---

# CodeRabbit Review

Run a CodeRabbit review using the arguments the user supplied.

## Context Checks

Run:

```bash
git rev-parse --is-inside-work-tree
coderabbit --version
coderabbit auth status --agent
```

If Git is unavailable or the current directory is not a Git repository, tell the user that CodeRabbit review needs a Git repository.

If CodeRabbit CLI is not installed, install it from CodeRabbit's official installer:

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
coderabbit --version
```

If `coderabbit --version` still fails after refreshing PATH, try `$HOME/.local/bin/coderabbit --version`. Use the resolved binary path for subsequent CodeRabbit commands in this session. If that still fails, report the exact failure and stop.

If CodeRabbit is not authenticated, start the agent auth flow:

```bash
coderabbit auth login --agent
coderabbit auth status --agent
```

Only continue after `coderabbit auth status --agent` succeeds.

## Build Review Command

Default to all changes:

```bash
coderabbit review --agent -t all
```

Map user arguments:

- `all` means `-t all`.
- `committed` means `-t committed`.
- `uncommitted` means `-t uncommitted`.
- `--base <branch>` passes the base branch.
- `--base-commit <sha>` passes the base commit.
- `--dir <path>` passes a review directory after verifying it is a Git repository.
- Existing instruction files such as `AGENTS.md`, `cursor.md`, or `.coderabbit.yaml` can be passed with `-c <file>` after confirming `coderabbit review --help` supports `-c`.

Before using `--dir`, run:

```bash
git -C <path> rev-parse --is-inside-work-tree
```

Before using `-c`, confirm each file exists and is relevant to the review.

## Present Results

Parse CodeRabbit agent output. Ignore status events in the user-facing summary. If the CLI returns an error, report it directly and do not substitute a manual review.

Return:

- Diff summary
- Issue count
- Critical issues
- Warning issues
- Info issues
- Suggested next fixes

Offer to apply fixes when CodeRabbit reports actionable remediation.
