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

  for (const field of ["logo", "skills", "agents", "commands", "rules"]) {
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

for (const file of walk("skills").filter((item) => item.endsWith("SKILL.md"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

for (const file of walk("agents").filter((item) => item.endsWith(".md"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

for (const file of walk("commands").filter((item) => item.endsWith(".md") || item.endsWith(".txt"))) {
  requireFrontmatterFields(file, ["name", "description"]);
}

for (const file of walk("rules").filter((item) => item.endsWith(".mdc"))) {
  requireFrontmatterFields(file, ["description", "alwaysApply"]);
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
