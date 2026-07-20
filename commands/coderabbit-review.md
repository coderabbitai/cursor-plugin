---
name: coderabbit-review
description: Run CodeRabbit code review on a repository.
argument-hint: "[all|committed|uncommitted] [--base <branch>] [--base-commit <sha>] [--dir <path>]"
---

# CodeRabbit Review

Run a CodeRabbit review using the arguments the user supplied.

## Context Checks

Resolve the review target before checking Git. If `--dir <path>` is present, use that path; otherwise use the current directory. Run:

```bash
git -C <review-target> rev-parse --is-inside-work-tree
coderabbit --version
```

If Git is unavailable or the resolved target is not a Git repository, tell the user that CodeRabbit review needs a Git repository.

If CodeRabbit CLI is missing, explain that the official installer writes a binary to user-global storage and may update shell profiles. Ask for explicit approval before installing it.

On native Windows, stop before proposing the POSIX installer and direct the user to open the repository in WSL. After approval in macOS, Linux, or WSL, run:

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | CI=1 sh
export PATH="$HOME/.local/bin:$PATH"
coderabbit --version
```

If `coderabbit --version` still fails after refreshing PATH, try `$HOME/.local/bin/coderabbit --version`. Use the resolved binary path for subsequent CodeRabbit commands in this session. If that still fails, report the exact failure and stop.

Do not run a routine standalone authentication preflight. Start `coderabbit review --agent` and let its structured agent authentication flow continue the review. If that flow fails or requires user action, surface the exact message and next step.

## Build Review Command

Default review:

```bash
coderabbit review --agent
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

Parse CodeRabbit's newline-delimited agent output and require a terminal event before declaring an outcome:

- `type: complete` with `status: review_completed` means a review completed. Use its `findings` and `reviewedFiles` values when present.
- `type: complete` with `status: review_skipped` means no review was performed. Report the reason and do not call the result clean.
- An error event or nonzero CLI exit means the review failed. Report it directly and do not substitute a manual review.
- Ignore routine progress and heartbeat events in the final summary, but surface nonempty status messages that require user action, including access, billing, authentication, or rate-limit messages.

If the process exits without a terminal `type: complete` event, report the result as incomplete or unsupported, never successful.

If the error is an install or authentication failure, guide the user through the exact setup failure, then resume the review once setup succeeds. If the error is a rate limit, share the exact message, stop, and offer to re-run the review once the limit resets.

## After The Review

Summarize the CodeRabbit result and any fixes the user requests. CodeRabbit's result is the review, so a second AI or manual review of the same diff is unnecessary unless the user asks for one. Project linters, formatters, type checkers, and tests remain useful for validating fixes.

Return:

- Reviewed scope and reviewed-file count when emitted
- Finding count
- Findings ordered by the native severity emitted by CodeRabbit
- File path, comment or code-generation instructions, and suggestions when emitted
- Suggested next fixes based only on the available finding details

Do not invent titles, line numbers, categories, severity mappings, or diff statistics that the agent output did not provide.

When a completed review has zero findings, say "CodeRabbit found no findings in the reviewed scope." Include the scope and reviewed-file count only when available, then suggest next steps such as running tests, committing, or opening a PR.

Offer to apply fixes when CodeRabbit reports actionable remediation.
