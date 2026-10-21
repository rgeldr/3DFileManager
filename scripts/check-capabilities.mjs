/**
 * Cross-check plugin commands the frontend invokes against Tauri capabilities.
 *
 * Reads src-tauri/capabilities/*.json and the ACL manifest produced by a Tauri
 * build (src-tauri/gen/schemas/acl-manifests.json). App commands such as
 * open_in_default_app are not plugin ACL entries and are not listed here.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "src-tauri/gen/schemas/acl-manifests.json");

if (!fs.existsSync(manifestPath)) {
  console.error(
    "Missing src-tauri/gen/schemas/acl-manifests.json. Run a Tauri or cargo build once so the ACL manifest exists.",
  );
  process.exit(1);
}

const manifests = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pluginKeys = Object.keys(manifests).sort((a, b) => b.length - a.length);

function ipcPrefix(plugin) {
  if (plugin.startsWith("core:")) return `plugin:${plugin.slice("core:".length)}`;
  if (plugin === "core") return null;
  return `plugin:${plugin}`;
}

function splitIdentifier(identifier) {
  for (const key of pluginKeys) {
    const prefix = `${key}:`;
    if (identifier.startsWith(prefix)) return { plugin: key, name: identifier.slice(prefix.length) };
  }
  throw new Error(`Unknown capability permission ${identifier}`);
}

function resolveNamed(plugin, name, stack) {
  const id = `${plugin}:${name}`;
  if (stack.has(id)) throw new Error(`Permission cycle at ${id}`);
  const next = new Set(stack);
  next.add(id);
  const manifest = manifests[plugin];
  if (!manifest) throw new Error(`No ACL manifest for ${plugin}`);

  const set = manifest.permission_sets?.[name];
  const isDefault = name === "default" || name === manifest.default_permission?.identifier;
  const refs = set?.permissions ?? (isDefault ? manifest.default_permission?.permissions : null);
  if (refs) {
    const allow = new Set();
    const deny = new Set();
    for (const ref of refs) {
      const child = ref.includes(":") ? resolveIdentifier(ref, next) : resolveNamed(plugin, ref, next);
      for (const command of child.allow) allow.add(command);
      for (const command of child.deny) deny.add(command);
    }
    return { allow, deny };
  }

  const permission = manifest.permissions?.[name];
  if (!permission) throw new Error(`Unknown permission ${id}`);
  const prefix = ipcPrefix(plugin);
  if (!prefix) return { allow: new Set(), deny: new Set() };
  const allow = new Set((permission.commands?.allow ?? []).map((command) => `${prefix}|${command}`));
  const deny = new Set((permission.commands?.deny ?? []).map((command) => `${prefix}|${command}`));
  return { allow, deny };
}

function resolveIdentifier(identifier, stack = new Set()) {
  const { plugin, name } = splitIdentifier(identifier);
  return resolveNamed(plugin, name, stack);
}

function globToRegExp(pattern) {
  let out = "^";
  for (const char of pattern) {
    if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
  }
  return new RegExp(`${out}$`);
}

function urlAllowed(patterns, url) {
  return patterns.some((pattern) => globToRegExp(pattern).test(url));
}

function commandsNearInvoke(source) {
  const map = new Map();
  const headerRe = /^[ \t]*(?:async\s+)?(?:function\s+|static\s+async\s+|static\s+)?([A-Za-z_][\w]*)\s*\([^)\n]*\)\s*\{?\s*$/;
  const invokeRe = /invoke\(\s*['"](plugin:[^'"]+)['"]/g;
  let match;
  while ((match = invokeRe.exec(source))) {
    const lines = source.slice(0, match.index).split("\n");
    let name;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const header = lines[i].match(headerRe);
      if (!header || /^(?:if|for|while|switch|catch|return)$/.test(header[1])) continue;
      name = header[1];
      break;
    }
    if (!name) continue;
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(match[1]);
  }
  return map;
}

function readMethods(relativePaths) {
  const map = new Map();
  for (const relativePath of relativePaths) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    for (const [name, commands] of commandsNearInvoke(source)) {
      if (!map.has(name)) map.set(name, new Set());
      for (const command of commands) map.get(name).add(command);
    }
  }
  return map;
}

function walkSources(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSources(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

function importsIn(source) {
  const found = [];
  const re = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    if (match[1]) continue;
    for (const part of match[2].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [exported, local] = trimmed.split(/\s+as\s+/).map((item) => item.trim());
      found.push({ exported, local: local || exported, from: match[3] });
    }
  }
  return found;
}

function called(source, name) {
  return new RegExp(`\\b${name}\\s*\\(`).test(source);
}

const EXPORTS = [
  {
    from: "@tauri-apps/plugin-opener",
    name: "openUrl",
    commands: ["plugin:opener|open_url"],
    file: "node_modules/@tauri-apps/plugin-opener/dist-js/index.js",
  },
  {
    from: "@tauri-apps/plugin-opener",
    name: "openPath",
    commands: ["plugin:opener|open_path"],
    file: "node_modules/@tauri-apps/plugin-opener/dist-js/index.js",
    forbidden: true,
  },
  {
    from: "@tauri-apps/plugin-opener",
    name: "revealItemInDir",
    commands: ["plugin:opener|reveal_item_in_dir"],
    file: "node_modules/@tauri-apps/plugin-opener/dist-js/index.js",
    forbidden: true,
  },
  {
    from: "@tauri-apps/plugin-dialog",
    name: "open",
    commands: ["plugin:dialog|open"],
    file: "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js",
  },
  {
    from: "@tauri-apps/plugin-dialog",
    name: "save",
    commands: ["plugin:dialog|save"],
    file: "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js",
  },
  {
    from: "@tauri-apps/plugin-dialog",
    name: "message",
    commands: ["plugin:dialog|message"],
    file: "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js",
  },
  {
    from: "@crabnebula/tauri-plugin-drag",
    name: "startDrag",
    commands: ["plugin:drag|start_drag"],
    file: "node_modules/@crabnebula/tauri-plugin-drag/dist-js/index.js",
  },
  {
    from: "@tauri-apps/plugin-updater",
    name: "check",
    commands: ["plugin:updater|check"],
    file: "node_modules/@tauri-apps/plugin-updater/dist-js/index.js",
  },
  {
    from: "@tauri-apps/plugin-process",
    name: "relaunch",
    commands: ["plugin:process|restart"],
    file: "node_modules/@tauri-apps/plugin-process/dist-js/index.js",
  },
  {
    from: "@tauri-apps/api/app",
    name: "getVersion",
    commands: ["plugin:app|version"],
    file: "node_modules/@tauri-apps/api/app.js",
  },
  {
    from: "@tauri-apps/api/event",
    name: "listen",
    commands: ["plugin:event|listen", "plugin:event|unlisten"],
    file: "node_modules/@tauri-apps/api/event.js",
  },
  {
    from: "@tauri-apps/api/event",
    name: "emit",
    commands: ["plugin:event|emit"],
    file: "node_modules/@tauri-apps/api/event.js",
  },
  {
    from: "@tauri-apps/api/event",
    name: "emitTo",
    commands: ["plugin:event|emit_to"],
    file: "node_modules/@tauri-apps/api/event.js",
  },
];

const KNOWN_IMPORTS = {
  "@tauri-apps/api/core": new Set(["invoke", "convertFileSrc"]),
  "@tauri-apps/api/menu": new Set([
    "Menu",
    "MenuItem",
    "PredefinedMenuItem",
    "Submenu",
    "CheckMenuItem",
    "IconMenuItem",
  ]),
  "@tauri-apps/api/webview": new Set(["getCurrentWebview", "Webview"]),
};

for (const item of EXPORTS) {
  if (!KNOWN_IMPORTS[item.from]) KNOWN_IMPORTS[item.from] = new Set();
  KNOWN_IMPORTS[item.from].add(item.name);
  const source = fs.readFileSync(path.join(root, item.file), "utf8");
  for (const command of item.commands) {
    assert.ok(source.includes(`'${command}'`) || source.includes(`"${command}"`), `${item.file} should invoke ${command}`);
  }
}

const menuMethods = readMethods([
  "node_modules/@tauri-apps/api/menu/base.js",
  "node_modules/@tauri-apps/api/menu/menu.js",
  "node_modules/@tauri-apps/api/menu/menuItem.js",
  "node_modules/@tauri-apps/api/menu/submenu.js",
  "node_modules/@tauri-apps/api/menu/checkMenuItem.js",
  "node_modules/@tauri-apps/api/menu/predefinedMenuItem.js",
  "node_modules/@tauri-apps/api/menu/iconMenuItem.js",
]);
const webviewMethods = readMethods(["node_modules/@tauri-apps/api/webview.js"]);

assert.deepEqual([...(menuMethods.get("newMenu") ?? [])], ["plugin:menu|new"]);
assert.ok(menuMethods.get("setAsAppMenu")?.has("plugin:menu|set_as_app_menu"));
assert.ok(menuMethods.get("setChecked")?.has("plugin:menu|set_checked"));
assert.ok(webviewMethods.get("setFocus")?.has("plugin:webview|set_webview_focus"));
assert.equal(resolveIdentifier("core:webview:default").allow.has("plugin:webview|set_webview_focus"), false);
assert.equal(resolveIdentifier("core:webview:allow-set-webview-focus").allow.has("plugin:webview|set_webview_focus"), true);
assert.equal(resolveIdentifier("opener:default").allow.has("plugin:opener|open_path"), false);
assert.equal(resolveIdentifier("opener:default").allow.has("plugin:opener|open_url"), true);
assert.equal(resolveIdentifier("opener:default").allow.has("plugin:opener|reveal_item_in_dir"), true);
assert.equal(resolveIdentifier("dialog:default").allow.has("plugin:dialog|open"), true);
assert.equal(resolveIdentifier("drag:default").allow.has("plugin:drag|start_drag"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:app|version"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:event|listen"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:event|unlisten"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:menu|new"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:menu|set_as_app_menu"), true);
assert.equal(resolveIdentifier("core:default").allow.has("plugin:menu|set_checked"), true);
assert.equal(
  urlAllowed(["https://github.com/rgeldr/3DFileManager#readme"], "https://github.com/rgeldr/3DFileManager#readme"),
  true,
);
assert.equal(urlAllowed(["https://github.com/rgeldr/3DFileManager#readme"], "https://evil.example"), false);
assert.equal(urlAllowed(["https://*"], "https://github.com/rgeldr/3DFileManager"), false);

const errors = [];
const required = new Set();
const openUrls = [];
const files = walkSources(path.join(root, "src"));

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  for (const binding of importsIn(source)) {
    const known = KNOWN_IMPORTS[binding.from];
    if (binding.from.startsWith("@tauri-apps/") || binding.from.startsWith("@crabnebula/tauri-plugin")) {
      if (!known) errors.push(`${relative} imports untracked plugin module ${binding.from}`);
      else if (!known.has(binding.exported)) {
        errors.push(`${relative} imports untracked ${binding.exported} from ${binding.from}`);
      }
    }
    const spec = EXPORTS.find((item) => item.from === binding.from && item.name === binding.exported);
    if (!spec || !called(source, binding.local)) continue;
    if (spec.forbidden) {
      errors.push(`${relative} calls ${binding.local}, which invokes ${spec.commands.join(", ")}. Open library files with open_in_default_app or reveal_file.`);
      continue;
    }
    for (const command of spec.commands) required.add(command);
  }

  if (importsIn(source).some((item) => item.from === "@tauri-apps/api/menu")) {
    for (const binding of importsIn(source)) {
      if (KNOWN_IMPORTS["@tauri-apps/api/menu"].has(binding.exported)) {
        const call = new RegExp(`\\b${binding.local}\\s*\\.\\s*new\\s*\\(`);
        if (call.test(source)) required.add("plugin:menu|new");
      }
    }
    for (const [method, commands] of menuMethods) {
      if (method === "newMenu" || method === "new") continue;
      if (new RegExp(`\\.${method}\\s*\\(`).test(source)) {
        for (const command of commands) required.add(command);
      }
    }
  }

  if (importsIn(source).some((item) => item.from === "@tauri-apps/api/webview")) {
    for (const [method, commands] of webviewMethods) {
      if (new RegExp(`\\.${method}\\s*\\(`).test(source)) {
        for (const command of commands) required.add(command);
      }
    }
  }

  const invokeRe = /invoke(?:<[^>\n]*>)?\(\s*["'](plugin:[^"']+)["']/g;
  let invokeMatch;
  while ((invokeMatch = invokeRe.exec(source))) required.add(invokeMatch[1]);

  if (/\b(?:openPath|revealItemInDir)\b|plugin:opener\|(?:open_path|reveal_item_in_dir)/.test(source)) {
    errors.push(`${relative} still references opener open_path or reveal_item_in_dir`);
  }

  const urlRe = /\bopenUrl\s*\(\s*(['"`])([\s\S]*?)\1/g;
  let urlMatch;
  while ((urlMatch = urlRe.exec(source))) openUrls.push({ file: relative, url: urlMatch[2] });
  if (/\bopenUrl\s*\(/.test(source) && !urlRe.test(source) && openUrls.every((item) => item.file !== relative)) {
    errors.push(`${relative} calls openUrl without a string literal`);
  }
}

const capabilityDir = path.join(root, "src-tauri/capabilities");
const capabilityFiles = fs.readdirSync(capabilityDir).filter((name) => name.endsWith(".json"));
const entries = [];
for (const name of capabilityFiles) {
  const json = JSON.parse(fs.readFileSync(path.join(capabilityDir, name), "utf8"));
  for (const permission of json.permissions ?? []) entries.push(permission);
}

const BANNED = new Set([
  "opener:default",
  "opener:allow-open-path",
  "opener:allow-reveal-item-in-dir",
  "opener:allow-default-urls",
]);

const granted = new Set();
const urlPatterns = [];
for (const entry of entries) {
  const identifier = typeof entry === "string" ? entry : entry.identifier;
  if (BANNED.has(identifier)) {
    errors.push(`${identifier} must stay off the webview. Library files are opened by catalog id from Rust.`);
  }
  try {
    const resolved = resolveIdentifier(identifier);
    for (const command of resolved.allow) granted.add(command);
    for (const command of resolved.deny) granted.delete(command);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (identifier === "opener:allow-open-url" && entry && typeof entry === "object") {
    const allow = Array.isArray(entry.allow) ? entry.allow : [];
    if (allow.length === 0) errors.push("opener:allow-open-url needs an https allow list");
    for (const item of allow) {
      const url = typeof item === "string" ? item : item?.url;
      if (typeof url !== "string" || !url.startsWith("https://")) {
        errors.push(`opener URL scope must be an https URL, got ${JSON.stringify(item)}`);
      } else urlPatterns.push(url);
    }
  }
}

for (const command of required) {
  if (!granted.has(command)) errors.push(`${command} is invoked by the frontend and is not allowed by capabilities`);
}
for (const item of openUrls) {
  if (!urlAllowed(urlPatterns, item.url)) {
    errors.push(`${item.file} opens ${item.url}, which is outside the opener:allow-open-url scope`);
  }
}
if (required.size === 0) errors.push("No plugin commands were detected; the scanner failed to read src/");

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`capabilities ok (${[...required].sort().join(", ")})`);
