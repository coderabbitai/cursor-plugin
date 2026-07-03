import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const REMINDER_WINDOW_MS = 10 * 60 * 1000;
const REMINDER_MAX = 6;
const LOG_PATH = path.join(os.tmpdir(), "coderabbit-plugin-hook.log");

function log(message) {
  if (process.env.CODERABBIT_HOOK_DEBUG !== "1") {
    return;
  }
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break the hook.
  }
}

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

function statePath(input) {
  const key = String(input?.conversation_id || input?.generation_id || "global").replace(/[^A-Za-z0-9_-]/g, "");
  return path.join(os.tmpdir(), `coderabbit-clean-review-${key || "global"}.json`);
}

function emit(context) {
  process.stdout.write(JSON.stringify({ additional_context: context }));
}

const raw = await readStdin();

let input;
try {
  input = JSON.parse(raw);
} catch {
  log("unparseable input");
  process.exit(0);
}

const toolName = input?.tool_name ?? "unknown";
const command = input?.tool_input?.command;
const snippet = typeof command === "string" ? command.slice(0, 100) : "";

if (isCodeRabbitReviewCommand(command)) {
  const clean = looksClean(input?.tool_output);
  log(`review-complete tool=${toolName} clean=${clean} cmd=${snippet}`);

  if (clean) {
    try {
      writeFileSync(statePath(input), JSON.stringify({ expires: Date.now() + REMINDER_WINDOW_MS, remaining: REMINDER_MAX }));
    } catch {
      // State is best-effort; the primary injection below still happens.
    }
    emit(
      "The CodeRabbit review for this request is complete and came back clean, meaning the changes passed review. Present a clean-result summary: what was reviewed (files changed, lines, scope), what it was checked for (bugs, security issues, code quality risks), confirmation that the changes passed, and suggested next steps such as running tests, committing, or opening a PR. Then finish the response there; the review request is fulfilled, so a second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them.",
    );
  } else {
    try {
      unlinkSync(statePath(input));
    } catch {
      // No stale clean-state to clear.
    }
    emit(
      "The CodeRabbit review for this request is complete. Present the parsed results grouped by severity and finish the response there; the review request is fulfilled. A second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them.",
    );
  }
  process.exit(0);
}

const state = statePath(input);
if (existsSync(state)) {
  try {
    const data = JSON.parse(readFileSync(state, "utf8"));
    if (Date.now() > data.expires || data.remaining <= 0) {
      unlinkSync(state);
    } else {
      writeFileSync(state, JSON.stringify({ ...data, remaining: data.remaining - 1 }));
      log(`reminder tool=${toolName} remaining=${data.remaining - 1} cmd=${snippet}`);
      emit(
        "Reminder: CodeRabbit already reviewed this request and the changes passed. Presenting that clean result completes the review; no additional review pass of the same diff is needed.",
      );
      process.exit(0);
    }
  } catch {
    // Fall through silently; the reminder is best-effort.
  }
}

log(`pass tool=${toolName} cmd=${snippet}`);
