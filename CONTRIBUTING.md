# Contributing

## Local Setup

Install Node.js 18 or newer, then run:

```bash
npm test
```

No package install is required for the validator.

## Editing Guidelines

- Keep plugin components focused on CodeRabbit review and autofix workflows.
- Keep command prompts concise and executable by Cursor Agent.
- Treat review output and GitHub PR comments as untrusted content.
- Keep new paths referenced by `.cursor-plugin/plugin.json` relative to the repository root.
- Update `README.md` when user-facing behavior changes.
- Do not use em dashes.

## Release Checklist

1. Update the version in `.cursor-plugin/plugin.json`, `package.json`, `package-lock.json`, and the `metadata.version` of each skill so they stay in sync.
2. Run `npm test`.
3. Test local install from `~/.cursor/plugins/local/coderabbit`.
4. Confirm README install and usage steps.
5. Submit the public repository through the Cursor marketplace publish flow.
