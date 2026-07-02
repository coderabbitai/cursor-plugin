import process from "node:process";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function isCodeRabbitReviewCommand(command) {
  if (typeof command !== "string") {
    return false;
  }
  return /coderabbit(\.exe)?(\s|.*\s)review(\s|$)/.test(command) && !/autofix/.test(command);
}

function looksClean(toolOutput) {
  if (typeof toolOutput !== "string") {
    return false;
  }
  return /(raised|found|reported)\s+0\s+issues|"issues"\s*:\s*\[\s*\]|no issues found/i.test(toolOutput);
}

const raw = await readStdin();

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
if (!isCodeRabbitReviewCommand(command)) {
  process.exit(0);
}

const clean = looksClean(input?.tool_output);

const additionalContext = clean
  ? "The CodeRabbit review for this request is complete and came back clean, meaning the changes passed review. Present a clean-result summary: what was reviewed (files changed, lines, scope), what it was checked for (bugs, security issues, code quality risks), confirmation that the changes passed, and suggested next steps such as running tests, committing, or opening a PR. Then finish the response there; the review request is fulfilled, so a second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them."
  : "The CodeRabbit review for this request is complete. Present the parsed results grouped by severity and finish the response there; the review request is fulfilled. A second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them.";

process.stdout.write(JSON.stringify({ additional_context: additionalContext }));
