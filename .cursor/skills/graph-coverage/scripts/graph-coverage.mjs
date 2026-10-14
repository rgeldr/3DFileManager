/**
 * Static graph coverage: TypeScript (compiler API) + Rust (syntactic).
 * stdout: single JSON report
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

function parseArgs(argv) {
  const opts = { changed: false, symbol: null, pathFilter: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--changed") opts.changed = true;
    else if (a === "--symbol" && argv[i + 1]) opts.symbol = argv[++i];
    else if (a === "--path" && argv[i + 1]) opts.pathFilter = argv[++i];
  }
  return opts;
}

function norm(p) {
  return path.normalize(p).replace(/\\/g, "/");
}

function relFromRoot(abs) {
  return norm(path.relative(REPO_ROOT, abs));
}

function matchesPathFilter(rel, filter) {
  if (!filter) return true;
  const f = norm(filter).replace(/^\.\//, "");
  return rel === f || rel.startsWith(f + "/") || rel.includes("/" + f + "/");
}

function walkDir(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkDir(full, ext, out);
    else if (ent.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

/** @type {{ nodes: Map<string, object>, edges: object[] }} */
const graph = { nodes: new Map(), edges: [] };

function addNode(node) {
  if (!graph.nodes.has(node.id)) graph.nodes.set(node.id, node);
  return node.id;
}

function addEdge(from, to, kind) {
  if (!from || !to) return;
  graph.edges.push({ from, to, kind });
}

function fnNodeId(file, name, line, kind = "function") {
  return `${norm(file)}::${kind}::${name}::${line}`;
}

function moduleNodeId(file) {
  return `${norm(file)}::module::__root__::0`;
}

function branchNodeId(file, label, line) {
  return `${norm(file)}::branch::${label}::${line}`;
}

// --- Test discovery ---

const testArtifacts = [];

function collectTests() {
  const files = [
    ...walkDir(path.join(REPO_ROOT, "scripts"), ".mjs").filter((f) =>
      /\.(test|spec)\./.test(f)
    ),
    ...walkDir(path.join(REPO_ROOT, "src"), ".ts").filter((f) =>
      /\.(test|spec)\./.test(f)
    ),
    ...walkDir(path.join(REPO_ROOT, "src-tauri", "src"), ".rs"),
  ];

  for (const file of files) {
    const text = readText(file);
    const rel = relFromRoot(file);
    if (file.endsWith(".rs")) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*#\[test\]/.test(lines[i]) || /^\s*#\[tokio::test\]/.test(lines[i])) {
          let name = `test_at_${i + 1}`;
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const m = lines[j].match(/^\s*fn\s+(\w+)/);
            if (m) {
              name = m[1];
              break;
            }
          }
          testArtifacts.push({ file: rel, name, text, line: i + 1, kind: "rust-test" });
        }
      }
      if (rel.includes("test") && testArtifacts.every((t) => t.file !== rel)) {
        testArtifacts.push({ file: rel, name: path.basename(rel), text, line: 1, kind: "test-file" });
      }
    } else {
      testArtifacts.push({
        file: rel,
        name: path.basename(rel),
        text,
        line: 1,
        kind: "test-file",
      });
    }
  }
}

function testMentionsName(testText, name) {
  if (!name || name.length < 2) return false;
  if (name === "__root__" || name === "default") return false;
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(testText);
}

function linkCoversEdges() {
  const codeNodes = [...graph.nodes.values()].filter(
    (n) => n.kind !== "module" && n.kind !== "branch"
  );
  for (const test of testArtifacts) {
    const testId = fnNodeId(test.file, test.name, test.line, "test");
    addNode({
      id: testId,
      kind: "test",
      name: test.name,
      file: test.file,
      line: test.line,
    });
    for (const node of codeNodes) {
      if (testMentionsName(test.text, node.name)) {
        addEdge(testId, node.id, "covers");
      }
    }
  }
}

// --- TypeScript ---

function analyzeTypeScript(pathFilter) {
  const configPath = ts.findConfigFile(REPO_ROOT, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return;
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  const symbolNameToIds = new Map();

  function registerSymbol(name, id) {
    if (!symbolNameToIds.has(name)) symbolNameToIds.set(name, []);
    symbolNameToIds.get(name).push(id);
  }

  function visitCfg(node, file, parentFnId, emitSequential) {
    if (ts.isIfStatement(node)) {
      const line = node.getStart(sourceFile) ? sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 : 0;
      const condId = branchNodeId(file, "if", line);
      addNode({ id: condId, kind: "branch", name: "if", file, line });
      if (parentFnId) {
        addEdge(parentFnId, condId, "cfg");
        addEdge(condId, condId, "cfg");
      }
      if (node.thenStatement) visitCfg(node.thenStatement, file, parentFnId, emitSequential);
      if (node.elseStatement) visitCfg(node.elseStatement, file, parentFnId, emitSequential);
      return;
    }
    if (ts.isSwitchStatement(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const swId = branchNodeId(file, "switch", line);
      addNode({ id: swId, kind: "branch", name: "switch", file, line });
      if (parentFnId) addEdge(parentFnId, swId, "cfg");
      for (const clause of node.caseBlock.clauses) {
        visitCfg(clause, file, parentFnId, emitSequential);
      }
      return;
    }
    if (
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node)
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const loopId = branchNodeId(file, "loop", line);
      const exitId = branchNodeId(file, "loop-exit", line);
      addNode({ id: loopId, kind: "branch", name: "loop", file, line });
      addNode({ id: exitId, kind: "branch", name: "loop-exit", file, line });
      if (parentFnId) {
        addEdge(parentFnId, loopId, "cfg");
        addEdge(loopId, exitId, "cfg");
      }
      ts.forEachChild(node, (ch) => visitCfg(ch, file, parentFnId, emitSequential));
      return;
    }
    ts.forEachChild(node, (ch) => visitCfg(ch, file, parentFnId, emitSequential));
  }

  let sourceFile;

  function analyzeDefUse(body, fnId, file) {
    const defs = new Map();
    function walk(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const defId = `${fnId}::def::${name}::${line}`;
        defs.set(name, defId);
        addNode({ id: defId, kind: "statement", name: `def:${name}`, file, line });
        addEdge(fnId, defId, "cfg");
      }
      if (ts.isIdentifier(node) && !ts.isDeclarationName(node)) {
        const name = node.text;
        if (defs.has(name)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          const useId = `${fnId}::use::${name}::${line}`;
          addNode({ id: useId, kind: "statement", name: `use:${name}`, file, line });
          addEdge(defs.get(name), useId, "def-use");
        }
      }
      if (ts.isCallExpression(node)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const stmtId = `${fnId}::call::${line}`;
        addNode({ id: stmtId, kind: "statement", name: "call", file, line });
        addEdge(fnId, stmtId, "cfg");
        resolveCall(node, fnId);
      }
      ts.forEachChild(node, walk);
    }
    walk(body);
  }

  function resolveCall(callNode, fromFnId) {
    const sig = checker.getResolvedSignature(callNode);
    if (sig) {
      const decl = sig.getDeclaration();
      if (decl) {
        const sf = decl.getSourceFile();
        const rel = relFromRoot(sf.fileName);
        const name = decl.name && ts.isIdentifier(decl.name) ? decl.name.text : "anonymous";
        const line = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1;
        const toId = fnNodeId(rel, name, line);
        if (graph.nodes.has(toId)) addEdge(fromFnId, toId, "call");
        return;
      }
    }
    if (ts.isPropertyAccessExpression(callNode.expression)) {
      const name = callNode.expression.name.text;
      const ids = symbolNameToIds.get(name);
      if (ids?.length === 1) addEdge(fromFnId, ids[0], "call");
    } else if (ts.isIdentifier(callNode.expression)) {
      const name = callNode.expression.text;
      const ids = symbolNameToIds.get(name);
      if (ids?.length === 1) addEdge(fromFnId, ids[0], "call");
    }
  }

  function visitTop(node, file, exportedNames) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const id = fnNodeId(file, name, line);
      const exported = exportedNames.has(name);
      addNode({ id, kind: "function", name, file, line, exported });
      registerSymbol(name, id);
      if (node.body) {
        visitCfg(node.body, file, id, true);
        analyzeDefUse(node.body, id, file);
      }
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const classId = fnNodeId(file, name, line, "class");
      addNode({ id: classId, kind: "class", name, file, line, exported: exportedNames.has(name) });
      registerSymbol(name, classId);
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const type of clause.types) {
            const tname = type.expression.getText(sourceFile);
            const ids = symbolNameToIds.get(tname);
            if (ids) for (const tid of ids) addEdge(classId, tid, "inherits");
          }
        }
      }
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const mname = member.name.text;
          const mline = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1;
          const mid = fnNodeId(file, `${name}.${mname}`, mline, "method");
          addNode({ id: mid, kind: "method", name: mname, file, line: mline, parent: name });
          registerSymbol(mname, mid);
          if (member.body) {
            visitCfg(member.body, file, mid, true);
            analyzeDefUse(member.body, mid, file);
          }
        }
      }
    }
    if (ts.isVariableStatement(node)) {
      const isExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isArrowFunction(decl.initializer)) {
          const name = decl.name.text;
          const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
          const id = fnNodeId(file, name, line);
          addNode({ id, kind: "function", name, file, line, exported: isExport });
          registerSymbol(name, id);
          visitCfg(decl.initializer.body, file, id, true);
          analyzeDefUse(decl.initializer.body, id, file);
        }
      }
    }
  }

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const file = relFromRoot(sf.fileName);
    if (!file.startsWith("src/")) continue;
    if (!matchesPathFilter(file, pathFilter)) continue;
    sourceFile = sf;
    const modId = moduleNodeId(file);
    addNode({ id: modId, kind: "module", name: path.basename(file), file, line: 1 });

    const exportedNames = new Set();
    sf.forEachChild((node) => {
      if (ts.canHaveModifiers(node)) {
        const mods = ts.getModifiers(node);
        if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
          if (ts.isFunctionDeclaration(node) && node.name) exportedNames.add(node.name.text);
          if (ts.isClassDeclaration(node) && node.name) exportedNames.add(node.name.text);
        }
      }
    });

    sf.forEachChild((node) => visitTop(node, file, exportedNames));

    // object literal exports: export const api = { ... }
    sf.forEachChild((node) => {
      if (!ts.isVariableStatement(node)) return;
      const isExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExport) return;
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          const objName = decl.name.text;
          registerSymbol(objName, fnNodeId(file, objName, sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1));
          for (const prop of decl.initializer.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isArrowFunction(prop.initializer)) {
              const mname = prop.name.text;
              const line = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile)).line + 1;
              const id = fnNodeId(file, `${objName}.${mname}`, line, "method");
              addNode({ id, kind: "method", name: mname, file, line, exported: true, parent: objName });
              registerSymbol(mname, id);
              visitCfg(prop.initializer.body, file, id, true);
              analyzeDefUse(prop.initializer.body, id, file);
            }
          }
        }
      }
    });
  }
}

// --- Rust ---

function analyzeRust(pathFilter) {
  const rustDir = path.join(REPO_ROOT, "src-tauri", "src");
  const files = walkDir(rustDir, ".rs");
  const fnNameToIds = new Map();

  function regFn(name, id) {
    if (!fnNameToIds.has(name)) fnNameToIds.set(name, []);
    fnNameToIds.get(name).push(id);
  }

  for (const abs of files) {
    const file = relFromRoot(abs);
    if (!matchesPathFilter(file, pathFilter)) continue;
    const text = readText(abs);
    const lines = text.split("\n");
    const modId = moduleNodeId(file);
    addNode({ id: modId, kind: "module", name: path.basename(file), file, line: 1 });

    let pendingTauri = false;
    let braceDepth = 0;
    let currentFn = null;
    let currentFnStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      if (/#\[tauri::command\]|#\[command\]/.test(line)) pendingTauri = true;

      const structM = line.match(/^\s*pub\s+struct\s+(\w+)/);
      if (structM) {
        const id = fnNodeId(file, structM[1], lineNo, "struct");
        addNode({ id, kind: "struct", name: structM[1], file, line: lineNo, exported: true });
        regFn(structM[1], id);
      }
      const enumM = line.match(/^\s*(pub\s+)?enum\s+(\w+)/);
      if (enumM) {
        const id = fnNodeId(file, enumM[2], lineNo, "enum");
        addNode({
          id,
          kind: "enum",
          name: enumM[2],
          file,
          line: lineNo,
          exported: !!enumM[1],
        });
        regFn(enumM[2], id);
      }
      const traitM = line.match(/^\s*trait\s+(\w+)/);
      if (traitM) {
        const id = fnNodeId(file, traitM[1], lineNo, "trait");
        addNode({ id, kind: "trait", name: traitM[1], file, line: lineNo });
        regFn(traitM[1], id);
      }
      const implM = line.match(/^\s*impl(?:<[^>]+>)?\s+(\w+)/);
      if (implM) {
        const id = fnNodeId(file, `impl:${implM[1]}`, lineNo, "impl");
        addNode({ id, kind: "impl", name: implM[1], file, line: lineNo });
        const targets = fnNameToIds.get(implM[1]);
        if (targets) for (const t of targets) addEdge(id, t, "inherits");
      }

      const fnM = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
      if (fnM && !line.includes("fn main")) {
        const name = fnM[1];
        const exported = /^\s*pub\s+/.test(line);
        const id = fnNodeId(file, name, lineNo);
        addNode({
          id,
          kind: "function",
          name,
          file,
          line: lineNo,
          exported,
          tauriCommand: pendingTauri,
        });
        regFn(name, id);
        pendingTauri = false;
        currentFn = id;
        currentFnStart = i;
      }

      if (currentFn) {
        if (/\bif\b/.test(line) && !line.trim().startsWith("//")) {
          const bid = branchNodeId(file, "if", lineNo);
          addNode({ id: bid, kind: "branch", name: "if", file, line: lineNo });
          addEdge(currentFn, bid, "cfg");
        }
        if (/\bmatch\b/.test(line)) {
          const bid = branchNodeId(file, "match", lineNo);
          addNode({ id: bid, kind: "branch", name: "match", file, line: lineNo });
          addEdge(currentFn, bid, "cfg");
        }
        if (/\b(while|for|loop)\b/.test(line)) {
          const bid = branchNodeId(file, "loop", lineNo);
          addNode({ id: bid, kind: "branch", name: "loop", file, line: lineNo });
          addEdge(currentFn, bid, "cfg");
        }
        const letM = line.match(/^\s*let\s+(?:mut\s+)?(\w+)/);
        if (letM && currentFn) {
          const defId = `${currentFn}::def::${letM[1]}::${lineNo}`;
          addNode({
            id: defId,
            kind: "statement",
            name: `def:${letM[1]}`,
            file,
            line: lineNo,
          });
          addEdge(currentFn, defId, "cfg");
        }
        for (const callM of line.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)) {
          const cname = callM[1];
          if (["if", "while", "for", "match", "return", "let", "pub", "fn", "async"].includes(cname))
            continue;
          const targets = fnNameToIds.get(cname);
          if (targets?.length === 1) addEdge(currentFn, targets[0], "call");
        }
      }

      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (currentFn && braceDepth <= 0 && i > currentFnStart) {
        currentFn = null;
        braceDepth = 0;
      }
    }
  }
}

// --- Metrics ---

function computeMetrics() {
  const nodes = [...graph.nodes.values()];
  const reachable = nodes.filter((n) => n.kind !== "test");
  const coveredIds = new Set(
    graph.edges.filter((e) => e.kind === "covers").map((e) => e.to)
  );
  const ncCovered = reachable.filter((n) => coveredIds.has(n.id)).length;
  const ncTotal = reachable.length;

  const cfgEdges = graph.edges.filter((e) => e.kind === "cfg");
  const fnHasCover = new Set();
  for (const e of graph.edges.filter((x) => x.kind === "covers")) {
    fnHasCover.add(e.to);
  }
  const ecTotal = cfgEdges.length;
  let ecCovered = 0;
  for (const e of cfgEdges) {
    if (fnHasCover.has(e.from)) ecCovered++;
  }

  const defUseEdges = graph.edges.filter((e) => e.kind === "def-use");
  const defNodes = nodes.filter((n) => n.name?.startsWith("def:"));
  const usedDefs = new Set(defUseEdges.map((e) => e.from));
  const unusedDefs = defNodes.filter((n) => !usedDefs.has(n.id)).length;

  const inDeg = new Map();
  const outDeg = new Map();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (e.kind === "covers") continue;
    outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  }
  const hotspots = nodes
    .filter((n) => n.kind !== "test" && n.kind !== "module")
    .map((n) => ({
      id: n.id,
      name: n.name,
      file: n.file,
      line: n.line,
      kind: n.kind,
      score: (inDeg.get(n.id) || 0) + (outDeg.get(n.id) || 0),
      inDegree: inDeg.get(n.id) || 0,
      outDegree: outDeg.get(n.id) || 0,
      covered: coveredIds.has(n.id),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);

  return {
    nodeCoverage: { covered: ncCovered, total: ncTotal, ratio: ncTotal ? ncCovered / ncTotal : 0 },
    edgeCoverage: { covered: ecCovered, total: ecTotal, ratio: ecTotal ? ecCovered / ecTotal : 0 },
    defUse: {
      pairs: defUseEdges.length,
      unusedDefs,
      ambiguousUses: 0,
    },
    hotspots,
  };
}

function buildCallGraph() {
  const callers = new Map();
  const callees = new Map();
  for (const e of graph.edges.filter((x) => x.kind === "call")) {
    if (!callers.has(e.to)) callers.set(e.to, new Set());
    if (!callees.has(e.from)) callees.set(e.from, new Set());
    callers.get(e.to).add(e.from);
    callees.get(e.from).add(e.to);
  }
  return { callers, callees };
}

function blastRadius(seedIds) {
  const { callers, callees } = buildCallGraph();
  const coveredByTest = new Map();
  for (const e of graph.edges.filter((x) => x.kind === "covers")) {
    if (!coveredByTest.has(e.to)) coveredByTest.set(e.to, []);
    coveredByTest.get(e.to).push(e.from);
  }

  const results = [];
  for (const seed of seedIds) {
    const node = graph.nodes.get(seed);
    if (!node) continue;

    const down = new Set();
    const up = new Set();
    const qd = [seed];
    while (qd.length) {
      const id = qd.shift();
      for (const c of callees.get(id) || []) {
        if (!down.has(c)) {
          down.add(c);
          qd.push(c);
        }
      }
    }
    const qu = [seed];
    while (qu.length) {
      const id = qu.shift();
      for (const c of callers.get(id) || []) {
        if (!up.has(c)) {
          up.add(c);
          qu.push(c);
        }
      }
    }

    const pubApis = [...down, seed]
      .map((id) => graph.nodes.get(id))
      .filter((n) => n && (n.exported || n.tauriCommand));

    results.push({
      seed: { id: seed, name: node.name, file: node.file, line: node.line },
      downstreamCount: down.size,
      upstreamCount: up.size,
      downstream: [...down].slice(0, 40).map((id) => summarize(id)),
      upstream: [...up].slice(0, 40).map((id) => summarize(id)),
      publicApis: pubApis.map((n) => ({
        name: n.name,
        file: n.file,
        line: n.line,
        tauriCommand: !!n.tauriCommand,
      })),
      linkedTests: (coveredByTest.get(seed) || []).map((id) => summarize(id)),
    });
  }
  return results;
}

function summarize(id) {
  const n = graph.nodes.get(id);
  if (!n) return { id };
  return { id, name: n.name, file: n.file, line: n.line, kind: n.kind };
}

function gitChangedSymbols() {
  let diff = "";
  try {
    diff = execSync("git diff HEAD", { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    diff = "";
  }
  try {
    diff += "\n" + execSync("git diff --cached", { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    /* ignore */
  }
  if (!diff.trim()) return [];

  const touchedFiles = new Set();
  for (const m of diff.matchAll(/^diff --git a\/(.+?) b\//gm)) touchedFiles.add(m[1]);
  for (const m of diff.matchAll(/^\+\+\+ b\/(.+)$/gm)) touchedFiles.add(m[1]);

  const seeds = [];
  for (const node of graph.nodes.values()) {
    if (node.kind === "module" || node.kind === "test" || node.kind === "branch") continue;
    const nf = norm(node.file);
    for (const tf of touchedFiles) {
      if (nf === norm(tf) || nf.endsWith("/" + tf)) {
        seeds.push(node.id);
        break;
      }
    }
  }
  return [...new Set(seeds)];
}

function findSymbolIds(symbol) {
  const out = [];
  for (const node of graph.nodes.values()) {
    if (node.name === symbol || node.id.includes(`::${symbol}::`)) out.push(node.id);
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  collectTests();
  analyzeTypeScript(opts.pathFilter);
  analyzeRust(opts.pathFilter);
  linkCoversEdges();

  const metrics = computeMetrics();

  let blastSeeds = [];
  if (opts.symbol) blastSeeds = findSymbolIds(opts.symbol);
  else if (opts.changed) blastSeeds = gitChangedSymbols();
  else {
    const changed = gitChangedSymbols();
    if (changed.length) blastSeeds = changed;
  }

  const blastRadiusReport = blastSeeds.length ? blastRadius(blastSeeds.slice(0, 20)) : [];

  const output = {
    repoRoot: REPO_ROOT,
    options: opts,
    staticCoverageOnly: true,
    scope: {
      pathFilter: opts.pathFilter,
      typescript: "src/",
      rust: "src-tauri/src/",
    },
    metrics,
    blastRadius: blastRadiusReport,
    graphSummary: {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      edgeKinds: graph.edges.reduce((acc, e) => {
        acc[e.kind] = (acc[e.kind] || 0) + 1;
        return acc;
      }, {}),
    },
    nodes: [...graph.nodes.values()],
    edges: graph.edges,
  };

  process.stdout.write(JSON.stringify(output, null, 2));
}

main();
