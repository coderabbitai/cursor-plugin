import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const expectedPluginDescription =
  "Run CodeRabbit reviews for code, PR, security, and quality checks, plus guarded autofix for unresolved GitHub PR feedback in Cursor.";

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return null;
  }
}

function readText(relativePath) {
  try {
    return readFileSync(path.join(root, relativePath), "utf8");
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return "";
  }
}

function requireText(relativePath, phrases) {
  const text = readText(relativePath).toLowerCase();
  for (const phrase of phrases) {
    if (!text.includes(phrase.toLowerCase())) {
      fail(`${relativePath}: missing safety invariant "${phrase}"`);
    }
  }
}

function forbidText(relativePath, phrases) {
  const text = readText(relativePath).toLowerCase();
  for (const phrase of phrases) {
    if (text.includes(phrase.toLowerCase())) {
      fail(`${relativePath}: forbidden stale contract text "${phrase}"`);
    }
  }
}

function requireOrderedText(relativePath, phrases) {
  const text = readText(relativePath).toLowerCase();
  let cursor = 0;
  for (const phrase of phrases) {
    const index = text.indexOf(phrase.toLowerCase(), cursor);
    if (index === -1) {
      fail(`${relativePath}: missing ordered safety invariant "${phrase}"`);
      return;
    }
    cursor = index + phrase.length;
  }
}

function forbidTextBetween(relativePath, startMarker, endMarker, phrase) {
  const text = readText(relativePath).toLowerCase();
  const start = text.indexOf(startMarker.toLowerCase());
  const end = text.indexOf(endMarker.toLowerCase(), start + startMarker.length);
  if (start === -1 || end === -1) {
    fail(`${relativePath}: missing section boundary for "${startMarker}" or "${endMarker}"`);
    return;
  }
  if (text.slice(start, end).includes(phrase.toLowerCase())) {
    fail(`${relativePath}: forbidden "${phrase}" before approval boundary`);
  }
}

function isSafeRelative(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..");
}

function assertPathExists(owner, value) {
  if (!isSafeRelative(value)) {
    fail(`${owner}: path must be relative and must not contain parent traversal: ${value}`);
    return;
  }

  const clean = value.replace(/^\.\//, "");
  if (!existsSync(path.join(root, clean))) {
    fail(`${owner}: path does not exist: ${value}`);
  }
}

function parseFrontmatter(relativePath) {
  const text = readFileSync(path.join(root, relativePath), "utf8");
  if (!text.startsWith("---\n")) {
    fail(`${relativePath}: missing frontmatter`);
    return {};
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${relativePath}: frontmatter is not closed`);
    return {};
  }

  const body = text.slice(4, end).split("\n");
  const data = {};
  for (const line of body) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      data[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return data;
}

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = path.join(relativeDir, entry);
    const absolutePath = path.join(root, relativePath);
    if (statSync(absolutePath).isDirectory()) {
      files.push(...walk(relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

function requireFrontmatterFields(relativePath, fields) {
  const data = parseFrontmatter(relativePath);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(data, field) || data[field] === "") {
      fail(`${relativePath}: missing frontmatter field ${field}`);
    }
  }
}

function checkNoEmDashes() {
  const textExtensions = new Set([".json", ".md", ".mdc", ".mjs", ".yml", ".yaml", ".txt"]);
  for (const relativePath of walk(".")) {
    if (relativePath.includes("node_modules")) {
      continue;
    }

    if (!textExtensions.has(path.extname(relativePath))) {
      continue;
    }

    const text = readFileSync(path.join(root, relativePath), "utf8");
    if (text.includes("\u2014")) {
      fail(`${relativePath}: contains an em dash`);
    }
  }
}

const plugin = readJson(".cursor-plugin/plugin.json");
if (plugin) {
  for (const field of ["name", "displayName", "version", "description", "author", "publisher", "license"]) {
    if (!plugin[field]) {
      fail(`.cursor-plugin/plugin.json: missing ${field}`);
    }
  }

  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(plugin.name || "")) {
    fail(".cursor-plugin/plugin.json: name must be lowercase and plugin-safe");
  }

  if (plugin.displayName !== "CodeRabbit") {
    fail('.cursor-plugin/plugin.json: displayName must be "CodeRabbit"');
  }

  if (plugin.author?.name !== "CodeRabbit") {
    fail('.cursor-plugin/plugin.json: author.name must be "CodeRabbit"');
  }

  if (plugin.publisher !== "CodeRabbit") {
    fail('.cursor-plugin/plugin.json: publisher must be "CodeRabbit"');
  }

  if (plugin.description !== expectedPluginDescription) {
    fail(`.cursor-plugin/plugin.json: description must be "${expectedPluginDescription}"`);
  }

  for (const field of ["logo", "skills", "agents", "commands", "rules", "hooks"]) {
    const value = plugin[field];
    if (Array.isArray(value)) {
      value.forEach((item) => assertPathExists(`.cursor-plugin/plugin.json ${field}`, item));
    } else if (typeof value === "string" && !/^https?:\/\//.test(value)) {
      assertPathExists(`.cursor-plugin/plugin.json ${field}`, value);
    }
  }
}

const marketplace = readJson(".cursor-plugin/marketplace.json");
if (marketplace) {
  if (!marketplace.name) {
    fail(".cursor-plugin/marketplace.json: missing name");
  }

  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    fail(".cursor-plugin/marketplace.json: plugins must contain at least one plugin");
  } else {
    if (marketplace.owner?.name !== "CodeRabbit") {
      fail('.cursor-plugin/marketplace.json: owner.name must be "CodeRabbit"');
    }

    if (marketplace.metadata?.description !== expectedPluginDescription) {
      fail(`.cursor-plugin/marketplace.json: metadata.description must be "${expectedPluginDescription}"`);
    }

    for (const entry of marketplace.plugins) {
      if (!entry.name || !entry.source) {
        fail(".cursor-plugin/marketplace.json: each plugin entry needs name and source");
      }
      if (plugin && entry.name !== plugin.name) {
        fail(`.cursor-plugin/marketplace.json: plugin entry ${entry.name} does not match ${plugin.name}`);
      }
      if (entry.description !== expectedPluginDescription) {
        fail(`.cursor-plugin/marketplace.json: plugin entry description must be "${expectedPluginDescription}"`);
      }
    }
  }
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
function skillMetadataVersion(relativePath) {
  const text = readText(relativePath);
  const frontmatterEnd = text.indexOf("\n---", 4);
  if (!text.startsWith("---\n") || frontmatterEnd === -1) {
    return undefined;
  }

  const lines = text.slice(4, frontmatterEnd).split("\n");
  const metadataIndex = lines.findIndex((line) => line === "metadata:");
  if (metadataIndex === -1) {
    return undefined;
  }

  for (const line of lines.slice(metadataIndex + 1)) {
    if (line !== "" && !/^\s/.test(line)) {
      break;
    }
    const match = line.match(/^  version:\s*["']?([^"'\s]+)["']?\s*$/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

const versionSurfaces = [
  [".cursor-plugin/plugin.json", plugin?.version],
  ["package.json", packageJson?.version],
  ["package-lock.json", packageLock?.version],
  ["package-lock.json packages root", packageLock?.packages?.[""]?.version],
  ["skills/code-review/SKILL.md", skillMetadataVersion("skills/code-review/SKILL.md")],
  ["skills/autofix/SKILL.md", skillMetadataVersion("skills/autofix/SKILL.md")],
];
const expectedVersion = versionSurfaces.find(([, version]) => version)?.[1];
for (const [surface, version] of versionSurfaces) {
  if (!version) {
    fail(`${surface}: missing version`);
  } else if (version !== expectedVersion) {
    fail(`${surface}: version ${version} does not match ${expectedVersion}`);
  }
}

for (const file of walk("skills").filter((item) => item.endsWith("SKILL.md"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

const routingRequirements = [
  { file: "skills/code-review/SKILL.md", phrases: ["any code review request", "does not mention coderabbit"] },
  { file: "agents/code-reviewer.md", phrases: ["any code review request", "does not mention coderabbit"] },
];

for (const { file, phrases } of routingRequirements) {
  if (!existsSync(path.join(root, file))) {
    fail(`${file}: file is required for default review routing`);
    continue;
  }

  const description = (parseFrontmatter(file).description || "").toLowerCase();
  for (const phrase of phrases) {
    if (!description.includes(phrase)) {
      fail(`${file}: description must keep default review routing phrase "${phrase}"`);
    }
  }
}

const reviewContractFiles = [
  "README.md",
  "commands/coderabbit-review.md",
  "agents/code-reviewer.md",
  "skills/code-review/SKILL.md",
  "rules/code-review-routing.mdc",
];

for (const file of reviewContractFiles) {
  forbidText(file, ["passed review", "+<added>/-<removed>"]);
}

requireText("skills/code-review/SKILL.md", ["0.6.5", "review_completed", "review_skipped", "findings", "native windows"]);

for (const file of ["README.md", "commands/coderabbit-review.md", "agents/code-reviewer.md", "skills/code-review/SKILL.md"]) {
  requireText(file, ["explicit approval", "curl -fsSL https://cli.coderabbit.ai/install.sh | CI=1 sh"]);
}

for (const file of ["commands/coderabbit-review.md", "agents/code-reviewer.md", "skills/code-review/SKILL.md"]) {
  requireText(file, ["0.6.5", "native windows"]);
}

for (const file of ["commands/coderabbit-autofix.md", "skills/autofix/SKILL.md"]) {
  forbidText(file, ["cli.coderabbit.ai/install.sh", "coderabbit --version"]);
}

requireText("skills/autofix/SKILL.md", [
  "git status --porcelain",
  "gh pr view --json url",
  "test \"$local_head\" = \"$pr_head\"",
  "submitted CodeRabbit review for the exact current PR head",
  String.raw`if \$pr.headRefOid != \"$local_head\"`,
  "--paginate",
  "--slurp",
  "test \"$current_pr_head\" = \"$expected_pr_head\"",
  "If `--no-commit` was requested, return a local-only summary. Do not push",
  "test \"$resolved_target\" = \"$approved_target\"",
  "test \"$(git rev-parse HEAD)\" = \"$approved_commit\"",
  "git push \"$head_repo_url\" \"HEAD:refs/heads/$head_ref\"",
  "test \"$remote_head\" = \"$approved_commit\"",
  "ask for approval before posting",
  "Never use a bare `git push`",
]);

requireOrderedText("skills/autofix/SKILL.md", [
  "### Preview Push Destination",
  "Commit: $autofix_commit",
  "Ask for approval after this read-only preview",
  "### Push After Approval",
  "test \"$(git rev-parse HEAD)\" = \"$approved_commit\"",
  "test \"$resolved_target\" = \"$approved_target\"",
  "test \"$remote_head\" = \"$expected_parent\"",
  "git push \"$head_repo_url\" \"HEAD:refs/heads/$head_ref\"",
  "test \"$remote_head\" = \"$approved_commit\"",
]);
forbidTextBetween(
  "skills/autofix/SKILL.md",
  "### Preview Push Destination",
  "### Push After Approval",
  "git push ",
);

for (const file of walk("agents").filter((item) => item.endsWith(".md"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

for (const file of walk("commands").filter((item) => item.endsWith(".md") || item.endsWith(".txt"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

for (const file of walk("rules").filter((item) => item.endsWith(".mdc"))) {
  requireFrontmatterFields(file, ["description", "alwaysApply"]);
}

if (existsSync(path.join(root, "hooks/hooks.json"))) {
  const hooksConfig = readJson("hooks/hooks.json");
  if (hooksConfig) {
    if (hooksConfig.version !== 1) {
      fail("hooks/hooks.json: version must be 1");
    }

    const hookEntries = Object.values(hooksConfig.hooks ?? {}).flat();
    if (hookEntries.length === 0) {
      fail("hooks/hooks.json: hooks must contain at least one entry");
    }

    for (const entry of hookEntries) {
      if (!entry.command) {
        fail("hooks/hooks.json: each hook entry needs a command");
        continue;
      }

      const scriptPath = entry.command.split(/\s+/).find((part) => /\.(mjs|cjs|js|sh|py)$/.test(part));
      if (scriptPath) {
        assertPathExists("hooks/hooks.json command", scriptPath);
      }
    }
  }
}

checkNoEmDashes();

if (failures.length > 0) {
  console.error("Validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Cursor plugin validation passed.");
