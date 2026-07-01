# GitHub Workflow Primitives

GitHub-specific commands for thread-aware CodeRabbit PR feedback.

Use these primitives when a workflow needs unresolved CodeRabbit review threads, not flat PR summaries.

## Prerequisites

- `gh` is installed.
- `gh auth status` succeeds.
- The current branch belongs to a GitHub repository.

## Resolve Current PR

```bash
pr_number=$(gh pr list --head "$(git branch --show-current)" --state open --json number --jq '.[0].number')
```

If no PR exists and the user wants one created:

```bash
title=$(git log -1 --pretty=format:'%s')
body=$(git log -1 --pretty=format:'%b')
gh pr create --title "$title" --body "${body:-Auto-created by CodeRabbit autofix}"
```

## Resolve Repository

```bash
owner=$(gh repo view --json owner --jq '.owner.login')
repo=$(gh repo view --json name --jq '.name')
```

## Fetch Review Threads

```bash
all_threads='[]'
cursor=""

while :; do
  args=(-F owner="$owner" -F repo="$repo" -F pr="$pr_number")
  if [ -n "$cursor" ]; then
    args+=(-F cursor="$cursor")
  fi

  response=$(gh api graphql "${args[@]}" -f query='query($owner:String!, $repo:String!, $pr:Int!, $cursor:String) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        title
        reviewThreads(first:100, after:$cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            isResolved
            isOutdated
            comments(first:1) {
              nodes {
                databaseId
                body
                path
                line
                startLine
                originalLine
                author { login }
              }
            }
          }
        }
      }
    }
  }')

  all_threads=$(jq -c --argjson response "$response" '. + $response.data.repository.pullRequest.reviewThreads.nodes' <<<"$all_threads")
  has_next=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage' <<<"$response")
  cursor=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // empty' <<<"$response")
  [ "$has_next" = "true" ] || break
done
```

Actionable thread rules:

- Root comment author is `coderabbitai`, `coderabbit[bot]`, or `coderabbitai[bot]`.
- `isResolved` is false.
- `isOutdated` is false.

## Detect Review In Progress

```bash
gh pr view "$pr_number" --json comments,reviews --jq '
  [
    (.comments[]?
      | select(.author.login == "coderabbitai" or .author.login == "coderabbit[bot]" or .author.login == "coderabbitai[bot]")
      | .body // empty),
    (.reviews[]?
      | select(.author.login == "coderabbitai" or .author.login == "coderabbit[bot]" or .author.login == "coderabbitai[bot]")
      | .body // empty)
  ]
  | map(select(test("Come back again in a few minutes")))
  | length
'
```

## Post Summary Comment

```bash
gh pr comment "$pr_number" --body "$(cat <<'EOF'
## CodeRabbit Autofix Summary

Applied fixes for <issue-count> CodeRabbit feedback item(s).

Files modified:
- `path/to/file-a`
- `path/to/file-b`

Commit: `<commit-sha>`

EOF
)"
```

Write summary comments from local state only. Do not include raw reviewer prompts or secret-bearing output.
