import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

  const argv = tokenizeSimpleCommand(command);
  if (!argv) {
    return false;
  }

  const binary = path.basename(argv[0]).toLowerCase();
  return (
    ["coderabbit", "coderabbit.exe", "cr", "cr.exe"].includes(binary) &&
    argv[1] === "review" &&
    argv.includes("--agent") &&
    !argv.includes("autofix")
  );
}

function tokenizeSimpleCommand(command) {
  const argv = [];
  let token = "";
  let quote = "";
  let escaped = false;
  let hasToken = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaped) {
      token += char;
      hasToken = true;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        token += char;
        hasToken = true;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === "$" && command[index + 1] === "(") {
      return null;
    }

    if (char === "#" || char === "\n" || char === "\r" || "|;&<>()`".includes(char)) {
      return null;
    }

    if (/\s/.test(char)) {
      if (hasToken) {
        argv.push(token);
        token = "";
        hasToken = false;
      }
      continue;
    }

    token += char;
    hasToken = true;
  }

  if (escaped || quote) {
    return null;
  }

  if (hasToken) {
    argv.push(token);
  }

  return argv;
}

function getExitCode(input) {
  const candidates = [
    input?.exit_code,
    input?.exitCode,
    input?.tool_exit_code,
    input?.tool_result?.exit_code,
    input?.tool_result?.exitCode,
    input?.tool_response?.exit_code,
    input?.tool_response?.exitCode,
  ];

  return candidates.find((candidate) => Number.isInteger(candidate));
}

function toolSucceeded(input) {
  const exitCode = getExitCode(input);
  if (exitCode !== undefined && exitCode !== 0) {
    return false;
  }

  return !(input?.tool_error || input?.error);
}

function reviewOutcome(toolOutput) {
  if (typeof toolOutput !== "string") {
    return null;
  }

  let completeEvent = null;

  for (const line of toolOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return null;
    }

    if (event?.type === "error") {
      return null;
    }

    if (event?.type === "complete") {
      completeEvent = event;
    }
  }

  if (!completeEvent || !Number.isInteger(completeEvent.findings)) {
    return null;
  }

  return completeEvent.findings === 0 ? "clean" : "issues";
}

function statePath(input) {
  const key = String(input?.conversation_id || input?.generation_id || "global");
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const baseDir =
    process.env.XDG_STATE_HOME || (os.homedir() ? path.join(os.homedir(), ".local", "state") : os.tmpdir());
  const dir = path.join(baseDir, "coderabbit", "cursor-plugin");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, `clean-review-${digest}.json`);
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

if (isCodeRabbitReviewCommand(command) && toolSucceeded(input)) {
  const outcome = reviewOutcome(input?.tool_output);
  log(`review-complete tool=${toolName} outcome=${outcome ?? "unknown"} cmd=${snippet}`);

  if (outcome === "clean") {
    try {
      writeFileSync(
        statePath(input),
        JSON.stringify({ expires: Date.now() + REMINDER_WINDOW_MS, remaining: REMINDER_MAX }),
        { mode: 0o600 },
      );
    } catch {
      // State is best-effort; the primary injection below still happens.
    }
    emit(
      "The CodeRabbit review for this request is complete and came back clean, meaning the changes passed review. Present a clean-result summary: what was reviewed (files changed, lines, scope), what it was checked for (bugs, security issues, code quality risks), confirmation that the changes passed, and suggested next steps such as running tests, committing, or opening a PR. Then finish the response there; the review request is fulfilled, so a second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them.",
    );
  } else if (outcome === "issues") {
    try {
      unlinkSync(statePath(input));
    } catch {
      // No stale clean-state to clear.
    }
    emit(
      "The CodeRabbit review for this request is complete. Present the parsed results grouped by severity and finish the response there; the review request is fulfilled. A second AI or manual pass over the same diff is not needed. Linters, type checkers, and tests remain available whenever the project workflow calls for them.",
    );
  } else {
    log(`pass unrecognized-agent-output tool=${toolName} cmd=${snippet}`);
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
