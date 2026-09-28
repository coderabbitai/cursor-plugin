---
name: coderabbit-review
description: Run CodeRabbit code review on a repository.
argument-hint: "[all|committed|uncommitted] [--include-untracked] [--base <branch>] [--base-commit <sha>] [--dir <path>]"
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

On native Windows, follow the skill's [PowerShell installation instructions](../skills/code-review/SKILL.md#prerequisites). After approval in macOS, Linux, or WSL, run:

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | CI=1 sh
export PATH="$HOME/.local/bin:$PATH"
coderabbit --version
```

On macOS, Linux, or WSL, if `coderabbit --version` still fails after refreshing PATH, try `$HOME/.local/bin/coderabbit --version`. Use the resolved binary path for subsequent CodeRabbit commands in this session. If that still fails, report the exact failure and stop.

Do not run a routine standalone authentication preflight. Start `coderabbit review --agent` and let its structured agent authentication flow continue the review. If that flow fails or requires user action, surface the exact message and next step.

Before starting, follow the skill's [live authentication handoff](../skills/code-review/SKILL.md#live-authentication-handoff), including EU first-login and headless API-key setup when applicable: consume incremental output when the tool supports it, present authentication actions immediately, and keep the same process alive while the user signs in. If live output or callback access is unavailable, use the terminal handoff in that section; do not wait for a hidden login to time out.

## Build Review Command

Default review:

```bash
coderabbit review --agent
```

Follow the skill's [review scope](../skills/code-review/SKILL.md#review-scope) guidance, including help-based capability checks, legacy fallback, and untracked-file coverage. Map user arguments on current clients:

- `all` means the default scope, with no scope flag.
- `committed` means `--committed`.
- `uncommitted` means `--uncommitted`.
- `--include-untracked` includes non-ignored files not added to Git; it cannot be combined with committed-only scope.
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

Parse CodeRabbit's newline-delimited agent output using the skill's [output handling](../skills/code-review/SKILL.md#output-handling). Wait for the terminal event and process exit status:

- `review_completed` alone does not prove success: `outcome: failed` or a positive `unreviewedFileCount` means incomplete. Report findings as partial and include the emitted reason. Warnings alone and absent legacy outcome fields are not failures; follow the linked completion rules.
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

If the user requests a fix-review loop, follow the skill's [run budget and stopping conditions](../skills/code-review/SKILL.md#fix-review-loop).
