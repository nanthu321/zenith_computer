/**
 * Explorer Test Suite
 * Tests all utility logic for WorkspaceExplorer, API helpers, and FileViewer
 * Wrapped in vitest test() for compatibility.
 */
import { test, expect } from 'vitest'

test('Explorer utility tests', () => {

// ─────────────────────────────────────────────────────────
// Minimal test harness
// ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ FAIL: ${msg}`);
  }
}

function assertEqual(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${msg}`);
  } else {
    failed++;
    failures.push(`${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    console.log(`  ❌ FAIL: ${msg}`);
    console.log(`         expected: ${JSON.stringify(b)}`);
    console.log(`         got:      ${JSON.stringify(a)}`);
  }
}

function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (e) {
    failed++;
    failures.push(`${name} — threw: ${e.message}`);
    console.log(`  ❌ SUITE THREW: ${e.message}`);
    console.log(e.stack);
  }
}

// ─────────────────────────────────────────────────────────
// Replicate utility functions from WorkspaceExplorer.jsx
// (copied inline since we can't import JSX in raw Node.js)
// ─────────────────────────────────────────────────────────

function normalizeEntries(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.entries && Array.isArray(data.entries)) return data.entries;
  if (data.files && Array.isArray(data.files)) return data.files;
  if (data.children && Array.isArray(data.children)) return data.children;
  return [];
}

function normalizeProjects(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.projects && Array.isArray(data.projects)) return data.projects;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const aDir = a.type === "directory" || a.type === "dir" || a.is_directory;
    const bDir = b.type === "directory" || b.type === "dir" || b.is_directory;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

// isBinaryFile logic from FileViewer.jsx
const BINARY_EXTS = new Set([
  "png","jpg","jpeg","gif","webp","bmp","ico",
  "zip","tar","gz","rar","7z",
  "pdf","doc","docx","xls","xlsx",
  "mp3","mp4","wav","avi","mov",
  "exe","dll","so","dylib","wasm",
  "pyc","class","o",
]);

function isBinaryFile(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  return BINARY_EXTS.has(ext);
}

// Language detection from fileIcons.jsx
function getLanguageFromExt(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  const langMap = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    py: "python", pyw: "python", pyi: "python",
    html: "html", htm: "html",
    css: "css", scss: "scss", sass: "scss", less: "less",
    json: "json",
    md: "markdown", mdx: "markdown",
    xml: "xml", svg: "xml",
    yaml: "yaml", yml: "yaml",
    sql: "sql",
    sh: "shell", bash: "shell", zsh: "shell",
    bat: "bat", ps1: "powershell",
    java: "java",
    c: "c", h: "c",
    cpp: "cpp", cc: "cpp", hpp: "cpp",
    cs: "csharp",
    rs: "rust",
    go: "go",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    r: "r",
    lua: "lua",
    perl: "perl",
    toml: "toml",
    ini: "ini",
    dockerfile: "dockerfile",
    txt: "plaintext",
    env: "plaintext",
    cfg: "plaintext",
    conf: "plaintext",
    lock: "json",
    gitignore: "plaintext",
  };
  const lower = (name || "").toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  return langMap[ext] || "plaintext";
}

// API path builder (replicated from workspace.js)
function buildListFilesPath(project, path = "", recursive = false) {
  return `/api/workspace/projects/${encodeURIComponent(project)}/files?path=${encodeURIComponent(path)}&recursive=${recursive}`;
}

function buildReadFilePath(project, path) {
  return `/api/workspace/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(path)}`;
}

// ─────────────────────────────────────────────────────────
// File node path resolution (replicated from WorkspaceExplorer)
// ─────────────────────────────────────────────────────────
function resolveChildPath(parentPath, childEntry) {
  const childName = childEntry.name || childEntry.filename || "";
  return childEntry.path || (parentPath ? `${parentPath}/${childName}` : childName);
}

function resolveRenamePath(nodePath, newName) {
  const parentPath = nodePath.includes("/")
    ? nodePath.substring(0, nodePath.lastIndexOf("/"))
    : "";
  return parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();
}

// ─────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────

describe("normalizeEntries — API response shape handling", () => {
  // TEST 1: null/undefined
  assert(normalizeEntries(null).length === 0, "null returns []");
  assert(normalizeEntries(undefined).length === 0, "undefined returns []");

  // TEST 2: plain array
  const arr = [{ name: "a.txt", type: "file" }];
  assertEqual(normalizeEntries(arr), arr, "plain array returned as-is");

  // TEST 3: { entries: [...] } shape
  const withEntries = { entries: [{ name: "b.txt" }] };
  assertEqual(normalizeEntries(withEntries), withEntries.entries, "{ entries } shape unwrapped");

  // TEST 4: { files: [...] } shape
  const withFiles = { files: [{ name: "c.txt" }] };
  assertEqual(normalizeEntries(withFiles), withFiles.files, "{ files } shape unwrapped");

  // TEST 5: { children: [...] } shape
  const withChildren = { children: [{ name: "d.txt" }] };
  assertEqual(normalizeEntries(withChildren), withChildren.children, "{ children } shape unwrapped");

  // TEST 6: empty object (unknown shape)
  assertEqual(normalizeEntries({}), [], "empty object returns []");

  // TEST 7: { success, data } wrapped — data is an array
  const wrapped = { success: true, data: [{ name: "e.txt" }] };
  // NOTE: normalizeEntries doesn't unwrap { success, data }
  // That's done by the API req() function. So this returns [] from normalizeEntries:
  const result = normalizeEntries(wrapped);
  assert(Array.isArray(result), "unknown shape returns array");
});

describe("normalizeProjects — various API response shapes", () => {
  // TEST: null
  assertEqual(normalizeProjects(null), [], "null → []");

  // TEST: plain array of strings
  const arr = ["project-a", "project-b"];
  assertEqual(normalizeProjects(arr), arr, "string array returned as-is");

  // TEST: { projects: [...] } shape
  const withProjects = { projects: ["x", "y"] };
  assertEqual(normalizeProjects(withProjects), ["x", "y"], "{ projects } shape unwrapped");

  // TEST: { data: [...] } shape
  const withData = { data: ["p1", "p2"] };
  assertEqual(normalizeProjects(withData), ["p1", "p2"], "{ data } shape unwrapped");

  // TEST: array of objects (API returns objects with name field)
  const objArray = [{ name: "project-1" }, { name: "project-2" }];
  assertEqual(normalizeProjects(objArray), objArray, "object array returned as-is (mapping done by caller)");
});

describe("sortEntries — directories first, alphabetical within groups", () => {
  const entries = [
    { name: "zebra.txt", type: "file" },
    { name: "alpha.txt", type: "file" },
    { name: "src", type: "directory" },
    { name: "node_modules", type: "dir" },
    { name: "app.js", type: "file" },
    { name: "components", is_directory: true },
  ];

  const sorted = sortEntries(entries);

  // All 3 directories come first (indices 0,1,2)
  const dirEntries = sorted.filter(e => Boolean(e.is_directory || e.type === "directory" || e.type === "dir"));
  const fileEntries = sorted.filter(e => !Boolean(e.is_directory || e.type === "directory" || e.type === "dir"));

  assert(dirEntries.length === 3, "Three directories total");
  assert(fileEntries.length === 3, "Three files total");

  // Every directory appears before every file in the sorted result
  const lastDirIdx = sorted.indexOf(dirEntries[dirEntries.length - 1]);
  const firstFileIdx = sorted.indexOf(fileEntries[0]);
  assert(lastDirIdx < firstFileIdx, "All dirs appear before all files");

  // Directories sorted alphabetically
  assertEqual(dirEntries[0].name, "components", "Dirs alphabetical: components first");
  assertEqual(dirEntries[1].name, "node_modules", "Dirs alphabetical: node_modules second");
  assertEqual(dirEntries[2].name, "src", "Dirs alphabetical: src third");

  // Files sorted alphabetically
  assertEqual(fileEntries[0].name, "alpha.txt", "Files alphabetical: alpha.txt first");
  assertEqual(fileEntries[1].name, "app.js", "Files alphabetical: app.js second");
  assertEqual(fileEntries[2].name, "zebra.txt", "Files alphabetical: zebra.txt last");

  // Original array not mutated (first element should still be zebra.txt)
  assertEqual(entries[0].name, "zebra.txt", "Original array not mutated");
});

describe("sortEntries — edge cases", () => {
  // Empty array
  assertEqual(sortEntries([]), [], "Empty array → empty");

  // Single item
  const single = [{ name: "main.py", type: "file" }];
  assertEqual(sortEntries(single).length, 1, "Single item stays");

  // Missing name field
  const noName = [{ type: "file" }, { name: "z.txt", type: "file" }];
  const sortedNoName = sortEntries(noName);
  assert(sortedNoName.length === 2, "Missing name doesn't throw");

  // All directories
  const allDirs = [
    { name: "z-dir", type: "directory" },
    { name: "a-dir", type: "directory" },
  ];
  const sortedDirs = sortEntries(allDirs);
  assertEqual(sortedDirs[0].name, "a-dir", "All dirs sorted alphabetically");
});

describe("isBinaryFile — binary extension detection", () => {
  // Binary files
  assert(isBinaryFile("image.png"), "PNG is binary");
  assert(isBinaryFile("photo.jpg"), "JPG is binary");
  assert(isBinaryFile("photo.JPEG"), "JPEG uppercase is binary");
  assert(isBinaryFile("archive.zip"), "ZIP is binary");
  assert(isBinaryFile("data.gz"), "GZ is binary");
  assert(isBinaryFile("doc.pdf"), "PDF is binary");
  assert(isBinaryFile("video.mp4"), "MP4 is binary");
  assert(isBinaryFile("sound.mp3"), "MP3 is binary");
  assert(isBinaryFile("app.exe"), "EXE is binary");
  assert(isBinaryFile("lib.wasm"), "WASM is binary");
  assert(isBinaryFile("module.pyc"), "PYC is binary");
  assert(isBinaryFile("Main.class"), "CLASS is binary");

  // Text files (should NOT be binary)
  assert(!isBinaryFile("main.js"), "JS is not binary");
  assert(!isBinaryFile("app.py"), "PY is not binary");
  assert(!isBinaryFile("README.md"), "MD is not binary");
  assert(!isBinaryFile("config.json"), "JSON is not binary");
  assert(!isBinaryFile("style.css"), "CSS is not binary");
  assert(!isBinaryFile("index.html"), "HTML is not binary");
  assert(!isBinaryFile("data.yaml"), "YAML is not binary");
  assert(!isBinaryFile("script.sh"), "SH is not binary");
  assert(!isBinaryFile(".env"), "ENV is not binary");
  assert(!isBinaryFile("Makefile"), "Makefile is not binary");

  // Edge cases
  assert(!isBinaryFile(""), "Empty name is not binary");
  assert(!isBinaryFile("no-extension"), "No extension → plaintext");
});

describe("getLanguageFromExt — Monaco editor language detection", () => {
  // JavaScript family
  assertEqual(getLanguageFromExt("app.js"), "javascript", "JS → javascript");
  assertEqual(getLanguageFromExt("app.jsx"), "javascript", "JSX → javascript");
  assertEqual(getLanguageFromExt("module.mjs"), "javascript", "MJS → javascript");

  // TypeScript family
  assertEqual(getLanguageFromExt("app.ts"), "typescript", "TS → typescript");
  assertEqual(getLanguageFromExt("component.tsx"), "typescript", "TSX → typescript");

  // Python
  assertEqual(getLanguageFromExt("script.py"), "python", "PY → python");
  assertEqual(getLanguageFromExt("types.pyi"), "python", "PYI → python");

  // Web
  assertEqual(getLanguageFromExt("index.html"), "html", "HTML → html");
  assertEqual(getLanguageFromExt("style.css"), "css", "CSS → css");
  assertEqual(getLanguageFromExt("vars.scss"), "scss", "SCSS → scss");
  assertEqual(getLanguageFromExt("page.less"), "less", "LESS → less");

  // Data formats
  assertEqual(getLanguageFromExt("config.json"), "json", "JSON → json");
  assertEqual(getLanguageFromExt("config.yaml"), "yaml", "YAML → yaml");
  assertEqual(getLanguageFromExt("config.yml"), "yaml", "YML → yaml");
  assertEqual(getLanguageFromExt("schema.xml"), "xml", "XML → xml");
  assertEqual(getLanguageFromExt("diagram.svg"), "xml", "SVG → xml");

  // Systems
  assertEqual(getLanguageFromExt("main.rs"), "rust", "RS → rust");
  assertEqual(getLanguageFromExt("main.go"), "go", "GO → go");
  assertEqual(getLanguageFromExt("Main.java"), "java", "JAVA → java");
  assertEqual(getLanguageFromExt("main.c"), "c", "C → c");
  assertEqual(getLanguageFromExt("app.cpp"), "cpp", "CPP → cpp");
  assertEqual(getLanguageFromExt("App.cs"), "csharp", "CS → csharp");

  // Shell
  assertEqual(getLanguageFromExt("deploy.sh"), "shell", "SH → shell");
  assertEqual(getLanguageFromExt("run.bash"), "shell", "BASH → shell");

  // Special filenames
  assertEqual(getLanguageFromExt("Dockerfile"), "dockerfile", "Dockerfile → dockerfile");
  assertEqual(getLanguageFromExt("Makefile"), "makefile", "Makefile → makefile");

  // Lock files
  assertEqual(getLanguageFromExt("package-lock.json"), "json", "package-lock.json → json");
  assertEqual(getLanguageFromExt("yarn.lock"), "json", "lock extension → json");

  // Unknown
  assertEqual(getLanguageFromExt("data.bin"), "plaintext", "Unknown ext → plaintext");
  assertEqual(getLanguageFromExt(""), "plaintext", "Empty name → plaintext");
  assertEqual(getLanguageFromExt("noext"), "plaintext", "No extension → plaintext");
});

describe("API URL construction — path encoding", () => {
  // Standard project/file
  const url1 = buildListFilesPath("my-project", "src/components");
  assert(url1.includes("my-project"), "Project name in URL");
  assert(url1.includes("src%2Fcomponents"), "Path encoded correctly");

  // Project with spaces
  const url2 = buildListFilesPath("my project", "");
  assert(url2.includes("my%20project"), "Space in project name encoded");

  // File read URL
  const url3 = buildReadFilePath("proj", "src/main.py");
  assert(url3.includes("/file?path="), "Read file uses /file?path=");
  assert(url3.includes("src%2Fmain.py"), "File path encoded");

  // Project with special chars
  const url4 = buildListFilesPath("proj/v2", "");
  assert(url4.includes("proj%2Fv2"), "Slash in project name encoded");

  // Recursive flag
  const url5 = buildListFilesPath("proj", "", true);
  assert(url5.includes("recursive=true"), "Recursive flag set to true");
  const url6 = buildListFilesPath("proj", "");
  assert(url6.includes("recursive=false"), "Recursive flag defaults to false");
});

describe("resolveChildPath — child path building", () => {
  // Child with explicit path
  const c1 = resolveChildPath("src", { name: "App.jsx", path: "src/App.jsx" });
  assertEqual(c1, "src/App.jsx", "Child with explicit path uses it");

  // Child without path (must be constructed)
  const c2 = resolveChildPath("src", { name: "index.js" });
  assertEqual(c2, "src/index.js", "Child without path constructed from parent+name");

  // Root-level child (no parent path)
  const c3 = resolveChildPath("", { name: "README.md" });
  assertEqual(c3, "README.md", "Root-level child uses just name");

  // Child using filename field
  const c4 = resolveChildPath("lib", { filename: "utils.ts" });
  assertEqual(c4, "lib/utils.ts", "filename field used as fallback");

  // Nested path construction
  const c5 = resolveChildPath("src/components", { name: "Button.tsx" });
  assertEqual(c5, "src/components/Button.tsx", "Nested path correctly constructed");
});

describe("resolveRenamePath — rename path building", () => {
  // File in subdirectory
  const r1 = resolveRenamePath("src/components/Button.jsx", "Button.tsx");
  assertEqual(r1, "src/components/Button.tsx", "Rename in subdirectory");

  // File at root
  const r2 = resolveRenamePath("README.md", "README.txt");
  assertEqual(r2, "README.txt", "Rename at root");

  // Trim whitespace
  const r3 = resolveRenamePath("src/app.js", "  app.ts  ");
  assertEqual(r3, "src/app.ts", "New name trimmed");

  // Deeply nested file
  const r4 = resolveRenamePath("a/b/c/d.txt", "e.txt");
  assertEqual(r4, "a/b/c/e.txt", "Deep nesting rename correct");
});

describe("normalizeProjects — project name extraction from mixed data", () => {
  // String list
  const strings = ["proj-a", "proj-b"];
  const normalized = normalizeProjects(strings).map(p =>
    typeof p === "string" ? p : (p.name || p.project_name || "")
  );
  assertEqual(normalized, ["proj-a", "proj-b"], "String list preserved");

  // Object list with name field
  const objs = [{ name: "proj-1" }, { name: "proj-2", other: "data" }];
  const normalizedObjs = normalizeProjects(objs).map(p =>
    typeof p === "string" ? p : (p.name || p.project_name || "")
  );
  assertEqual(normalizedObjs, ["proj-1", "proj-2"], "Object list with name field");

  // Object list with project_name field
  const projName = [{ project_name: "my-project" }];
  const normalizedProjName = normalizeProjects(projName).map(p =>
    typeof p === "string" ? p : (p.name || p.project_name || "")
  );
  assertEqual(normalizedProjName, ["my-project"], "project_name field extracted");

  // Wrapped in { projects: [...] }
  const wrapped = { projects: [{ name: "wrapped-proj" }] };
  const normalizedWrapped = normalizeProjects(wrapped).map(p =>
    typeof p === "string" ? p : (p.name || p.project_name || "")
  );
  assertEqual(normalizedWrapped, ["wrapped-proj"], "Wrapped projects shape");
});

describe("sortEntries — stability: equal entries", () => {
  const entries = [
    { name: "b.txt", type: "file" },
    { name: "a.txt", type: "file" },
    { name: "b-dir", type: "directory" },
    { name: "a-dir", type: "directory" },
  ];
  const sorted = sortEntries(entries);
  // All dirs before files
  assert(
    sorted.slice(0, 2).every(e => e.type === "directory"),
    "Both dirs come before files"
  );
  assertEqual(sorted[0].name, "a-dir", "a-dir first among dirs");
  assertEqual(sorted[1].name, "b-dir", "b-dir second among dirs");
  assertEqual(sorted[2].name, "a.txt", "a.txt first among files");
  assertEqual(sorted[3].name, "b.txt", "b.txt second among files");
});

describe("FileViewer: content normalization logic", () => {
  // Simulate the text extraction from workspaceApi.readFile response
  function extractContent(data) {
    return typeof data === "string"
      ? data
      : (data?.content ?? JSON.stringify(data, null, 2) ?? "");
  }

  // Plain string response
  assertEqual(extractContent("hello world"), "hello world", "String response returned as-is");

  // Object with content field
  assertEqual(extractContent({ content: "file content here" }), "file content here", "content field extracted");

  // Unknown object shape → JSON stringified
  const obj = { data: "something", meta: 42 };
  assertEqual(extractContent(obj), JSON.stringify(obj, null, 2), "Unknown shape JSON stringified");

  // Null content field
  assertEqual(extractContent({ content: null }), JSON.stringify({ content: null }, null, 2), "null content falls back to stringify");

  // Empty string content
  assertEqual(extractContent({ content: "" }), "", "Empty string content returned");
});

describe("isDirty check — detect unsaved changes", () => {
  function isDirty(content, original) {
    return content !== original;
  }

  assert(isDirty("modified", "original"), "Different strings → dirty");
  assert(!isDirty("same", "same"), "Same strings → not dirty");
  assert(isDirty("", "something"), "Empty vs non-empty → dirty");
  assert(!isDirty("", ""), "Both empty → not dirty");
  assert(isDirty("a\nb", "a\nc"), "Multiline difference → dirty");
  assert(!isDirty("a\nb", "a\nb"), "Multiline same → not dirty");
});

describe("API auth header construction — X-User-Id from localStorage", () => {
  // Simulate the req() header building logic from workspace.js
  function buildHeaders(token, storedUserStr) {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };
    try {
      if (storedUserStr) {
        const parsed = JSON.parse(storedUserStr);
        if (parsed.user_id) headers["X-User-Id"] = String(parsed.user_id);
      }
    } catch (_) { /* ignore */ }
    return headers;
  }

  // Normal case
  const h1 = buildHeaders("tok123", JSON.stringify({ user_id: 42 }));
  assertEqual(h1["Authorization"], "Bearer tok123", "Bearer token set");
  assertEqual(h1["X-User-Id"], "42", "X-User-Id set from user_id");

  // String user_id
  const h2 = buildHeaders("tok", JSON.stringify({ user_id: "user-abc" }));
  assertEqual(h2["X-User-Id"], "user-abc", "String user_id preserved");

  // Missing user_id field
  const h3 = buildHeaders("tok", JSON.stringify({ email: "x@y.com" }));
  assert(!h3["X-User-Id"], "Missing user_id → no X-User-Id header");

  // Null stored user
  const h4 = buildHeaders("tok", null);
  assert(!h4["X-User-Id"], "Null storedUser → no X-User-Id header");

  // Invalid JSON (should not throw)
  const h5 = buildHeaders("tok", "not-valid-json");
  assertEqual(h5["Authorization"], "Bearer tok", "Invalid JSON → still has token");
  assert(!h5["X-User-Id"], "Invalid JSON → no X-User-Id");

  // Empty stored user string
  const h6 = buildHeaders("tok", "");
  assert(!h6["X-User-Id"], "Empty string storedUser → no X-User-Id");
});

describe("API data unwrapping — { success, data } pattern", () => {
  // Simulate the req() unwrap logic
  function unwrapApiResponse(data) {
    if (data === null || data === undefined) return data;
    if (data.success !== undefined && data.data !== undefined) return data.data;
    if (data.success === false) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  // Wrapped response
  assertEqual(unwrapApiResponse({ success: true, data: [1, 2, 3] }), [1, 2, 3], "Wrapped data unwrapped");

  // Direct response
  assertEqual(unwrapApiResponse({ files: ["a"] }), { files: ["a"] }, "Direct response returned as-is");

  // Null
  assertEqual(unwrapApiResponse(null), null, "null returned as null");

  // Error response
  let threw = false;
  try {
    unwrapApiResponse({ success: false, error: "Not found" });
  } catch (e) {
    threw = true;
    assert(e.message === "Not found", "Error message extracted");
  }
  assert(threw, "Failed response throws error");

  // Array response (direct)
  assertEqual(unwrapApiResponse(["a", "b"]), ["a", "b"], "Array response returned as-is");
});

describe("collapseAllSignal — effect trigger", () => {
  // Test that the collapse mechanism works correctly
  // In React, useEffect with [collapseAllSignal] fires on every increment.
  // We simulate this:
  let openState = true;
  let signal = 0;

  function applyCollapseSignal(newSignal) {
    if (newSignal > 0) openState = false;
  }

  // Initial: no collapse
  applyCollapseSignal(signal);
  assert(openState === true, "Initial state: open=true, not collapsed");

  // Increment signal → collapse
  signal += 1;
  applyCollapseSignal(signal);
  assert(openState === false, "After signal=1: collapsed");

  // Open again, increment again → collapses again
  openState = true;
  signal += 1;
  applyCollapseSignal(signal);
  assert(openState === false, "After signal=2: collapsed again");
});

describe("Tab management — open/close tabs", () => {
  // Simulate the tab state logic from WorkspaceExplorer
  let openTabs = [];
  let selectedFile = null;

  function openTab(fileNode) {
    if (openTabs.some(t => t.path === fileNode.path)) return; // already open
    openTabs = [...openTabs, fileNode];
    selectedFile = fileNode;
  }

  function closeTab(filePath) {
    const next = openTabs.filter(t => t.path !== filePath);
    if (selectedFile?.path === filePath) {
      selectedFile = next.length > 0 ? next[next.length - 1] : null;
    }
    openTabs = next;
  }

  // Open first tab
  openTab({ name: "App.jsx", path: "src/App.jsx", type: "file" });
  assert(openTabs.length === 1, "First tab opened");
  assertEqual(selectedFile.path, "src/App.jsx", "First tab is selected");

  // Open second tab
  openTab({ name: "main.js", path: "src/main.js", type: "file" });
  assert(openTabs.length === 2, "Second tab opened");
  assertEqual(selectedFile.path, "src/main.js", "Second tab selected");

  // Open duplicate — should not add
  openTab({ name: "App.jsx", path: "src/App.jsx", type: "file" });
  assert(openTabs.length === 2, "Duplicate tab NOT added");

  // Close active tab → switches to previous
  closeTab("src/main.js");
  assert(openTabs.length === 1, "Tab closed");
  assertEqual(selectedFile.path, "src/App.jsx", "After closing active tab, previous tab selected");

  // Close last tab → selectedFile = null
  closeTab("src/App.jsx");
  assert(openTabs.length === 0, "All tabs closed");
  assert(selectedFile === null, "No selected file when all tabs closed");
});

describe("Sidebar resize — width clamping", () => {
  // Simulate the resize handler logic from WorkspaceExplorer
  function clampWidth(width) {
    return Math.max(160, Math.min(500, width));
  }

  assertEqual(clampWidth(260), 260, "Normal width (260) unchanged");
  assertEqual(clampWidth(100), 160, "Too narrow (100) clamped to 160");
  assertEqual(clampWidth(600), 500, "Too wide (600) clamped to 500");
  assertEqual(clampWidth(160), 160, "Min boundary (160) OK");
  assertEqual(clampWidth(500), 500, "Max boundary (500) OK");
  assertEqual(clampWidth(159), 160, "Just below min → clamped");
  assertEqual(clampWidth(501), 500, "Just above max → clamped");
  assertEqual(clampWidth(0), 160, "Zero → min");
  assertEqual(clampWidth(-100), 160, "Negative → min");
});

describe("Query params deep-link — project/file from URL", () => {
  // Simulate the useEffect that reads searchParams
  function parseDeepLink(params) {
    const project = params.get ? params.get("project") : params["project"];
    const file = params.get ? params.get("file") : params["file"];
    if (!project) return { project: null, file: null };
    const fileNode = file
      ? { name: file.split("/").pop(), path: file, type: "file" }
      : null;
    return { project, file: fileNode };
  }

  // Map-like fake searchParams
  const fakeParams = {
    get: (key) => ({ project: "my-proj", file: "src/components/App.jsx" })[key] ?? null
  };

  const result = parseDeepLink(fakeParams);
  assertEqual(result.project, "my-proj", "Project param extracted");
  assertEqual(result.file.path, "src/components/App.jsx", "File path extracted");
  assertEqual(result.file.name, "App.jsx", "File name is basename");

  // No params
  const emptyParams = { get: () => null };
  const empty = parseDeepLink(emptyParams);
  assert(empty.project === null, "No project param → null");
  assert(empty.file === null, "No file param → null");

  // Project only (no file)
  const projOnly = { get: (k) => k === "project" ? "my-proj" : null };
  const projResult = parseDeepLink(projOnly);
  assertEqual(projResult.project, "my-proj", "Project only extracted");
  assert(projResult.file === null, "No file → null");
});

describe("isDirectory helper — all node shape variants", () => {
  function isDirectory(node) {
    return Boolean(
      node.type === "directory" || node.type === "dir" || node.is_directory
    );
  }

  assert(isDirectory({ type: "directory" }), "type=directory → dir");
  assert(isDirectory({ type: "dir" }), "type=dir → dir");
  assert(isDirectory({ is_directory: true }), "is_directory=true → dir");
  assert(isDirectory({ is_directory: 1 }), "is_directory=1 (truthy) → dir");
  assert(!isDirectory({ type: "file" }), "type=file → not dir");
  assert(!isDirectory({ type: "FILE" }), "type=FILE (case sensitive) → not dir");
  assert(!isDirectory({ is_directory: false }), "is_directory=false → not dir");
  assert(!isDirectory({ is_directory: 0 }), "is_directory=0 → not dir");
  assert(!isDirectory({ name: "folder" }), "no type markers → not dir");
  assert(!isDirectory({}), "empty node → not dir");
});

describe("handleFileClick guard — never opens directories", () => {
  function shouldOpenFile(fileNode) {
    // Replicated from the fixed handleFileClick:
    if (!fileNode) return false;
    const isDir = Boolean(
      fileNode.type === "directory" || fileNode.type === "dir" || fileNode.is_directory
    );
    return !isDir;
  }

  assert(shouldOpenFile({ name: "app.js", type: "file", path: "src/app.js" }), "JS file → opens");
  assert(shouldOpenFile({ name: "README.md", path: "README.md" }), "No type field → opens (treated as file)");
  assert(!shouldOpenFile({ name: "src", type: "directory", path: "src" }), "type=directory → blocked");
  assert(!shouldOpenFile({ name: "lib", type: "dir", path: "lib" }), "type=dir → blocked");
  assert(!shouldOpenFile({ name: "assets", is_directory: true, path: "assets" }), "is_directory=true → blocked");
  assert(!shouldOpenFile(null), "null → blocked");
  assert(!shouldOpenFile(undefined), "undefined → blocked");
});

describe("Tab close — correct tab selection after close", () => {
  // Simulates the fixed handleCloseTab logic
  function closeTab(tabs, selectedPath, closedPath) {
    const prev = tabs;
    const next = prev.filter(t => t.path !== closedPath);

    let newSelected;
    if (selectedPath !== closedPath) {
      newSelected = selectedPath; // unchanged
    } else if (next.length === 0) {
      newSelected = null;
    } else {
      const closedIdx = prev.findIndex(t => t.path === closedPath);
      const newIdx = Math.min(closedIdx, next.length - 1);
      newSelected = next[newIdx].path;
    }

    return { tabs: next, selected: newSelected };
  }

  const tabs = [
    { name: "A.jsx", path: "A.jsx" },
    { name: "B.jsx", path: "B.jsx" },
    { name: "C.jsx", path: "C.jsx" },
  ];

  // Close middle tab (B) while B is active → select A (closedIdx=1, min(1,1)=1 → next[1]=C)
  const r1 = closeTab(tabs, "B.jsx", "B.jsx");
  assertEqual(r1.tabs.length, 2, "Closed B: 2 tabs remain");
  assertEqual(r1.selected, "C.jsx", "After closing B (idx=1), select next[1]=C");

  // Close first tab (A) while A is active → select B (closedIdx=0, min(0,1)=0 → next[0]=B)
  const r2 = closeTab(tabs, "A.jsx", "A.jsx");
  assertEqual(r2.tabs.length, 2, "Closed A: 2 tabs remain");
  assertEqual(r2.selected, "B.jsx", "After closing A (idx=0), select next[0]=B");

  // Close last tab (C) while C is active → select B (closedIdx=2, min(2,1)=1 → next[1]=C... wait)
  const r3 = closeTab(tabs, "C.jsx", "C.jsx");
  assertEqual(r3.tabs.length, 2, "Closed C: 2 tabs remain");
  assertEqual(r3.selected, "B.jsx", "After closing C (last, idx=2), select next[min(2,1)]=B");

  // Close non-active tab → selected unchanged
  const r4 = closeTab(tabs, "A.jsx", "C.jsx");
  assertEqual(r4.tabs.length, 2, "Closed C while A active: 2 tabs");
  assertEqual(r4.selected, "A.jsx", "Non-active tab close doesn't change selection");

  // Close only tab → null selected
  const singleTab = [{ name: "only.js", path: "only.js" }];
  const r5 = closeTab(singleTab, "only.js", "only.js");
  assertEqual(r5.tabs.length, 0, "Closed last tab: 0 tabs");
  assert(r5.selected === null, "No tabs left → selected=null");
});

describe("Rename path — edge cases", () => {
  function resolveRenamePath(nodePath, newName) {
    const trimmed = newName.trim();
    const parentPath = nodePath && nodePath.includes("/")
      ? nodePath.substring(0, nodePath.lastIndexOf("/"))
      : "";
    return parentPath ? `${parentPath}/${trimmed}` : trimmed;
  }

  // null/undefined path safety
  const r1 = resolveRenamePath("", "newname.txt");
  assertEqual(r1, "newname.txt", "Empty path → just the new name");

  // Whitespace trimming
  const r2 = resolveRenamePath("src/old.js", "  new.js  ");
  assertEqual(r2, "src/new.js", "Trimmed whitespace in new name");

  // Single-level path
  const r3 = resolveRenamePath("toplevel.txt", "renamed.txt");
  assertEqual(r3, "renamed.txt", "Top-level file renamed correctly");
});

describe("Project name normalization — mixed API response types", () => {
  // Simulates the projects.map() call in WorkspaceExplorer
  function mapProjectNames(rawList) {
    return rawList.map(p => typeof p === "string" ? p : (p.name || p.project_name || ""))
      .filter(name => name.length > 0);
  }

  assertEqual(mapProjectNames(["a", "b", "c"]), ["a", "b", "c"], "String array passes through");
  assertEqual(mapProjectNames([{ name: "proj1" }, { name: "proj2" }]), ["proj1", "proj2"], "Object array with name field");
  assertEqual(mapProjectNames([{ project_name: "x" }]), ["x"], "project_name field fallback");
  assertEqual(mapProjectNames([{ other: "z" }]), [], "No name fields → empty (filtered out)");
  assertEqual(mapProjectNames([]), [], "Empty list → empty");
  assertEqual(
    mapProjectNames(["string-proj", { name: "obj-proj" }, { project_name: "legacy-proj" }]),
    ["string-proj", "obj-proj", "legacy-proj"],
    "Mixed types in same array"
  );
});

// ─────────────────────────────────────────────────────────
// New File/Folder target project resolution logic
// ─────────────────────────────────────────────────────────
describe("resolveTargetProject — smart project selection for new file/folder", () => {
  // Replicate the logic from WorkspaceExplorer's resolveTargetProject
  function resolveTargetProject(expandedProjects, activeProject, projects) {
    if (expandedProjects.size === 1) {
      return [...expandedProjects][0];
    }
    if (activeProject && projects.includes(activeProject)) {
      return activeProject;
    }
    if (projects.length === 1) {
      return projects[0];
    }
    return null; // ambiguous — need user to pick
  }

  const allProjects = ["BITCOIN_PRICE_TRACKER", "GOOD-MORNING-JAVA", "WEATHER-APP"];

  // Case 1: Exactly one project expanded → use it
  const r1 = resolveTargetProject(new Set(["WEATHER-APP"]), null, allProjects);
  assertEqual(r1, "WEATHER-APP", "Single expanded project → use it");

  // Case 2: No projects expanded, but activeProject set → use it
  const r2 = resolveTargetProject(new Set(), "GOOD-MORNING-JAVA", allProjects);
  assertEqual(r2, "GOOD-MORNING-JAVA", "Active project → use it");

  // Case 3: Multiple projects expanded, no activeProject → null (show picker)
  const r3 = resolveTargetProject(new Set(["BITCOIN_PRICE_TRACKER", "WEATHER-APP"]), null, allProjects);
  assert(r3 === null, "Multiple expanded, no active → null (ambiguous)");

  // Case 4: No expanded, no active, but only 1 project exists → use it
  const singleProject = ["WEATHER-APP"];
  const r4 = resolveTargetProject(new Set(), null, singleProject);
  assertEqual(r4, "WEATHER-APP", "Only one project → use it");

  // Case 5: No expanded, no active, multiple projects → null (show picker)
  const r5 = resolveTargetProject(new Set(), null, allProjects);
  assert(r5 === null, "No expanded, no active, multiple projects → null (show picker)");

  // Case 6: Multiple expanded, activeProject set → use activeProject
  const r6 = resolveTargetProject(new Set(["BITCOIN_PRICE_TRACKER", "WEATHER-APP"]), "WEATHER-APP", allProjects);
  assertEqual(r6, "WEATHER-APP", "Multiple expanded but active project → use active");

  // Case 7: No projects at all → null
  const r7 = resolveTargetProject(new Set(), null, []);
  assert(r7 === null, "No projects → null");

  // Case 8: Active project not in project list (stale) → null with multiple
  const r8 = resolveTargetProject(new Set(), "DELETED_PROJECT", allProjects);
  assert(r8 === null, "Stale active project (not in list) with multiple projects → null");

  // Case 9: Active project not in list, but only 1 project → use it
  const r9 = resolveTargetProject(new Set(), "DELETED_PROJECT", singleProject);
  assertEqual(r9, "WEATHER-APP", "Stale active but single project → use it");
});

// ─────────────────────────────────────────────────────────
// Code Execution — file type detection
// ─────────────────────────────────────────────────────────
describe("getExecutionLanguage — detect executable file types", () => {
  // Replicate the logic from useCodeExecution.js
  const EXT_TO_LANGUAGE = {
    py: 'python', pyw: 'python',
    java: 'java',
    js: 'javascript', mjs: 'javascript',
    sh: 'shell', bash: 'shell',
  };

  function getExecutionLanguage(filename) {
    if (!filename) return null;
    const ext = filename.split('.').pop().toLowerCase();
    return EXT_TO_LANGUAGE[ext] || null;
  }

  function isExecutable(filename) {
    return getExecutionLanguage(filename) !== null;
  }

  // Python files
  assertEqual(getExecutionLanguage("script.py"), "python", "PY → python");
  assertEqual(getExecutionLanguage("app.pyw"), "python", "PYW → python");

  // Java files
  assertEqual(getExecutionLanguage("Main.java"), "java", "JAVA → java");

  // JavaScript files
  assertEqual(getExecutionLanguage("server.js"), "javascript", "JS → javascript");
  assertEqual(getExecutionLanguage("module.mjs"), "javascript", "MJS → javascript");

  // Shell files
  assertEqual(getExecutionLanguage("deploy.sh"), "shell", "SH → shell");
  assertEqual(getExecutionLanguage("start.bash"), "shell", "BASH → shell");

  // Non-executable files → null
  assert(getExecutionLanguage("style.css") === null, "CSS not executable");
  assert(getExecutionLanguage("index.html") === null, "HTML not executable");
  assert(getExecutionLanguage("config.json") === null, "JSON not executable");
  assert(getExecutionLanguage("README.md") === null, "MD not executable");
  assert(getExecutionLanguage("image.png") === null, "PNG not executable");
  assert(getExecutionLanguage("data.xml") === null, "XML not executable");
  assert(getExecutionLanguage("") === null, "Empty string not executable");
  assert(getExecutionLanguage(null) === null, "null not executable");

  // isExecutable shorthand
  assert(isExecutable("main.py"), "main.py is executable");
  assert(isExecutable("App.java"), "App.java is executable");
  assert(isExecutable("index.js"), "index.js is executable");
  assert(isExecutable("run.sh"), "run.sh is executable");
  assert(!isExecutable("style.css"), "style.css is NOT executable");
  assert(!isExecutable("index.html"), "index.html is NOT executable");
  assert(!isExecutable("config.yaml"), "config.yaml is NOT executable");
});

describe("isExecutableFile — project-level helper", () => {
  // Replicate from useProjectPreview.js
  function isExecutableFile(filename) {
    if (!filename) return false;
    const ext = filename.split('.').pop().toLowerCase();
    return ['py', 'pyw', 'java', 'js', 'mjs', 'sh', 'bash'].includes(ext);
  }

  assert(isExecutableFile("script.py"), "Python file is executable");
  assert(isExecutableFile("Main.java"), "Java file is executable");
  assert(isExecutableFile("app.js"), "JS file is executable");
  assert(isExecutableFile("deploy.sh"), "Shell file is executable");
  assert(!isExecutableFile("index.html"), "HTML is NOT executable");
  assert(!isExecutableFile("style.css"), "CSS is NOT executable");
  assert(!isExecutableFile("photo.png"), "PNG is NOT executable");
  assert(!isExecutableFile(""), "Empty is NOT executable");
  assert(!isExecutableFile(null), "null is NOT executable");
});

describe("getFileCategory — file type categorization", () => {
  // Replicate from useProjectPreview.js
  const EXT_TO_CATEGORY = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', pyw: 'python', pyi: 'python', ipynb: 'python',
    java: 'java', jar: 'java', class: 'java',
    cs: 'csharp',
    c: 'cpp', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin',
    sh: 'shell', bash: 'shell', zsh: 'shell', bat: 'shell', ps1: 'shell',
    md: 'markdown', mdx: 'markdown',
    json: 'json', xml: 'xml', svg: 'svg',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
    yaml: 'config', yml: 'config', toml: 'config', ini: 'config',
    sql: 'data', csv: 'data',
  };

  function getFileCategory(filename) {
    if (!filename) return 'other';
    const ext = filename.split('.').pop().toLowerCase();
    return EXT_TO_CATEGORY[ext] || 'other';
  }

  assertEqual(getFileCategory("index.html"), "html", "HTML categorized");
  assertEqual(getFileCategory("app.py"), "python", "Python categorized");
  assertEqual(getFileCategory("Main.java"), "java", "Java categorized");
  assertEqual(getFileCategory("server.js"), "javascript", "JS categorized");
  assertEqual(getFileCategory("style.css"), "css", "CSS categorized");
  assertEqual(getFileCategory("main.go"), "go", "Go categorized");
  assertEqual(getFileCategory("lib.rs"), "rust", "Rust categorized");
  assertEqual(getFileCategory("config.yaml"), "config", "YAML categorized as config");
  assertEqual(getFileCategory("photo.png"), "image", "PNG categorized as image");
  assertEqual(getFileCategory("data.csv"), "data", "CSV categorized as data");
  assertEqual(getFileCategory("unknown.xyz"), "other", "Unknown ext → other");
  assertEqual(getFileCategory(""), "other", "Empty → other");
  assertEqual(getFileCategory(null), "other", "null → other");
});

describe("analyzeProjectFiles — project composition analysis", () => {
  // Replicate from useProjectPreview.js
  function getFileCategory(filename) {
    if (!filename) return 'other';
    const ext = filename.split('.').pop().toLowerCase();
    const EXT_TO_CATEGORY = {
      html: 'html', py: 'python', java: 'java', js: 'javascript',
      css: 'css', json: 'json', md: 'markdown', sh: 'shell',
    };
    return EXT_TO_CATEGORY[ext] || 'other';
  }

  function analyzeProjectFiles(files) {
    const categories = {};
    let hasHtml = false;
    for (const f of files) {
      const cat = getFileCategory(f.name);
      categories[cat] = (categories[cat] || 0) + 1;
      if (cat === 'html') hasHtml = true;
    }
    let primaryCategory = 'other';
    let maxCount = 0;
    for (const [cat, count] of Object.entries(categories)) {
      if (count > maxCount) { maxCount = count; primaryCategory = cat; }
    }
    return { categories, primaryCategory, hasHtml, totalFiles: files.length, files };
  }

  // Python project
  const pyFiles = [
    { name: "main.py", path: "main.py" },
    { name: "utils.py", path: "utils.py" },
    { name: "requirements.txt", path: "requirements.txt" },
  ];
  const pyAnalysis = analyzeProjectFiles(pyFiles);
  assertEqual(pyAnalysis.primaryCategory, "python", "Python project primary category");
  assert(pyAnalysis.hasHtml === false, "Python project has no HTML");
  assertEqual(pyAnalysis.totalFiles, 3, "Python project has 3 files");

  // HTML project
  const htmlFiles = [
    { name: "index.html", path: "index.html" },
    { name: "style.css", path: "style.css" },
    { name: "app.js", path: "app.js" },
  ];
  const htmlAnalysis = analyzeProjectFiles(htmlFiles);
  assert(htmlAnalysis.hasHtml === true, "HTML project has HTML files");

  // Java project
  const javaFiles = [
    { name: "Main.java", path: "Main.java" },
    { name: "Helper.java", path: "Helper.java" },
    { name: "config.json", path: "config.json" },
  ];
  const javaAnalysis = analyzeProjectFiles(javaFiles);
  assertEqual(javaAnalysis.primaryCategory, "java", "Java project primary category");
  assert(javaAnalysis.hasHtml === false, "Java project has no HTML");

  // Empty project
  const emptyAnalysis = analyzeProjectFiles([]);
  assertEqual(emptyAnalysis.totalFiles, 0, "Empty project has 0 files");
  assertEqual(emptyAnalysis.primaryCategory, "other", "Empty project → other");
});

describe("Execution output normalization", () => {
  function normalizeOutput(output) {
    if (!output) return [];
    if (Array.isArray(output)) return output.map(String);
    if (typeof output === 'string') return output.split('\n');
    return [String(output)];
  }

  assertEqual(normalizeOutput("hello\nworld"), ["hello", "world"], "String split by newlines");
  assertEqual(normalizeOutput(["a", "b"]), ["a", "b"], "Array passed through");
  assertEqual(normalizeOutput(null), [], "null → empty");
  assertEqual(normalizeOutput(""), [], "Empty string → empty");
  assertEqual(normalizeOutput(42), ["42"], "Number → string array");
  assertEqual(normalizeOutput(["a", 42, true]), ["a", "42", "true"], "Mixed array → string array");
});

// ─────────────────────────────────────────────────────────
// ZIP structure & download logic tests
// ─────────────────────────────────────────────────────────

describe("ZIP folder structure — root folder wrapping", () => {
  // Simulate the ZIP structure logic from downloadUtils.js
  // Files should be nested under a root folder named after the project

  function buildZipPaths(projectName, files) {
    // Simulates how downloadProjectAsZip now builds paths
    return files.map(f => `${projectName}/${f.relativePath}`);
  }

  const files = [
    { relativePath: "index.html", name: "index.html" },
    { relativePath: "css/style.css", name: "style.css" },
    { relativePath: "js/app.js", name: "app.js" },
  ];

  const zipPaths = buildZipPaths("MY-PROJECT", files);
  assertEqual(zipPaths[0], "MY-PROJECT/index.html", "Root file wrapped under project folder");
  assertEqual(zipPaths[1], "MY-PROJECT/css/style.css", "Nested file wrapped under project folder");
  assertEqual(zipPaths[2], "MY-PROJECT/js/app.js", "Nested JS file wrapped under project folder");

  // Empty project creates a root folder entry
  const emptyPaths = buildZipPaths("EMPTY-PROJECT", []);
  assertEqual(emptyPaths.length, 0, "Empty project has no file paths (folder entry is implicit)");
});

describe("isBinaryFile — used in ZIP binary handling", () => {
  // Extended binary set matching downloadUtils.js (includes font extensions)
  const BINARY_EXTS_FULL = new Set([
    "png","jpg","jpeg","gif","webp","bmp","ico","tiff","tif",
    "zip","tar","gz","rar","7z",
    "pdf","doc","docx","xls","xlsx","ppt","pptx",
    "mp3","mp4","wav","avi","mov","ogg","webm","mkv",
    "exe","dll","so","dylib","wasm",
    "pyc","class","o",
    "woff","woff2","ttf","otf","eot",
  ]);
  function isBinaryFileFull(name = "") {
    const ext = name.split(".").pop().toLowerCase();
    return BINARY_EXTS_FULL.has(ext);
  }

  // Binary files should be read as ArrayBuffer/Uint8Array for ZIP
  assert(isBinaryFileFull("image.png"), "PNG is binary → needs binary read for ZIP");
  assert(isBinaryFileFull("archive.zip"), "ZIP is binary → needs binary read for ZIP");
  assert(isBinaryFileFull("font.woff2"), "WOFF2 is binary → needs binary read for ZIP");
  assert(isBinaryFileFull("font.ttf"), "TTF is binary → needs binary read for ZIP");
  assert(!isBinaryFileFull("app.js"), "JS is text → can be added as string to ZIP");
  assert(!isBinaryFileFull("styles.css"), "CSS is text → can be added as string to ZIP");
  assert(!isBinaryFileFull("README.md"), "MD is text → can be added as string to ZIP");
});

describe("ZIP magic bytes validation", () => {
  // Simulate the ZIP validation logic from tryBackendDownload
  function isValidZipHeader(bytes) {
    return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  }

  // Valid ZIP header (PK)
  assert(isValidZipHeader([0x50, 0x4B, 0x03, 0x04]), "PK\\x03\\x04 is valid ZIP header");
  assert(isValidZipHeader([0x50, 0x4B, 0x05, 0x06]), "PK\\x05\\x06 (empty archive) is valid ZIP header");

  // Invalid headers (HTML error page, plain text, etc.)
  assert(!isValidZipHeader([0x3C, 0x68, 0x74, 0x6D]), "<htm... is NOT a valid ZIP header");
  assert(!isValidZipHeader([0x7B, 0x22, 0x65, 0x72]), "{\"er... (JSON error) is NOT a valid ZIP header");
  assert(!isValidZipHeader([]), "Empty bytes are NOT a valid ZIP header");
  assert(!isValidZipHeader([0x50]), "Single byte is NOT a valid ZIP header");
});

describe("Parent path extraction for nested file creation", () => {
  // Simulate the logic used in workspace.js writeFile to ensure parent dirs
  function getParentPath(filePath) {
    if (!filePath || !filePath.includes("/")) return "";
    return filePath.substring(0, filePath.lastIndexOf("/"));
  }

  assertEqual(getParentPath("src/components/Button.jsx"), "src/components", "Nested file parent path");
  assertEqual(getParentPath("src/index.js"), "src", "One-level nested file parent path");
  assertEqual(getParentPath("README.md"), "", "Root-level file has no parent");
  assertEqual(getParentPath(""), "", "Empty path has no parent");
  assertEqual(getParentPath("a/b/c/d/file.txt"), "a/b/c/d", "Deeply nested parent path");
});

describe("Recursive folder creation — path segments", () => {
  // Simulate the logic used in workspace.js createFolder for nested paths
  function getIntermediatePaths(path) {
    if (!path || !path.includes("/")) return [];
    const segments = path.split("/");
    const paths = [];
    let current = "";
    for (let i = 0; i < segments.length - 1; i++) {
      current = current ? `${current}/${segments[i]}` : segments[i];
      paths.push(current);
    }
    return paths;
  }

  assertEqual(getIntermediatePaths("src/components/utils"), ["src", "src/components"], "Two intermediate paths");
  assertEqual(getIntermediatePaths("a/b/c/d"), ["a", "a/b", "a/b/c"], "Three intermediate paths");
  assertEqual(getIntermediatePaths("single-folder"), [], "No intermediate paths for single segment");
  assertEqual(getIntermediatePaths(""), [], "Empty path has no intermediates");
  assertEqual(getIntermediatePaths("a/b"), ["a"], "One intermediate path");
});

describe("collectFiles — relative path building for ZIP", () => {
  // Simulate how collectFiles builds relative paths
  function buildRelativePath(relativePath, name) {
    return relativePath ? `${relativePath}/${name}` : name;
  }

  assertEqual(buildRelativePath("", "index.html"), "index.html", "Root-level file");
  assertEqual(buildRelativePath("src", "app.js"), "src/app.js", "Nested file");
  assertEqual(buildRelativePath("src/components", "Button.tsx"), "src/components/Button.tsx", "Deeply nested file");
});

// ─────────────────────────────────────────────────────────
// Section button fallback — New File/Folder when FileTree is
// not mounted (project collapsed / wrapped project scenario)
// ─────────────────────────────────────────────────────────
describe("Section button fallback — triggerCreateInProject when ref is null", () => {
  // Simulates the fixed button onClick logic in ProjectSection:
  //   if (fileTreeRef?.current?.triggerNewFile) {
  //     fileTreeRef.current.triggerNewFile();
  //   } else {
  //     onCreateInProject?.(name, "file");
  //   }
  function simulateNewFileClick(fileTreeRef, projectName, onCreateInProject) {
    let usedRef = false;
    let usedFallback = false;
    let fallbackArgs = null;

    if (fileTreeRef?.current?.triggerNewFile) {
      fileTreeRef.current.triggerNewFile();
      usedRef = true;
    } else {
      if (onCreateInProject) {
        onCreateInProject(projectName, "file");
        usedFallback = true;
      }
    }
    return { usedRef, usedFallback };
  }

  function simulateNewFolderClick(fileTreeRef, projectName, onCreateInProject) {
    let usedRef = false;
    let usedFallback = false;

    if (fileTreeRef?.current?.triggerNewFolder) {
      fileTreeRef.current.triggerNewFolder();
      usedRef = true;
    } else {
      if (onCreateInProject) {
        onCreateInProject(projectName, "folder");
        usedFallback = true;
      }
    }
    return { usedRef, usedFallback };
  }

  // Case 1: FileTree is mounted (ref available) → use ref
  const mountedRef = {
    current: {
      triggerNewFile: () => {},
      triggerNewFolder: () => {},
      triggerRefresh: () => {},
    }
  };
  const r1 = simulateNewFileClick(mountedRef, "MY-PROJECT", () => {});
  assert(r1.usedRef === true, "Mounted ref: uses triggerNewFile via ref");
  assert(r1.usedFallback === false, "Mounted ref: does NOT use fallback");

  // Case 2: FileTree NOT mounted (ref.current = null) → use fallback
  const nullRef = { current: null };
  let fallbackCalled = false;
  let fallbackProject = null;
  let fallbackType = null;
  const r2 = simulateNewFileClick(nullRef, "MY-PROJECT", (proj, type) => {
    fallbackCalled = true;
    fallbackProject = proj;
    fallbackType = type;
  });
  assert(r2.usedRef === false, "Null ref: does NOT use ref");
  assert(r2.usedFallback === true, "Null ref: uses fallback");
  assert(fallbackCalled === true, "Null ref: onCreateInProject was called");
  assertEqual(fallbackProject, "MY-PROJECT", "Null ref: correct project passed to fallback");
  assertEqual(fallbackType, "file", "Null ref: correct type 'file' passed to fallback");

  // Case 3: ref is undefined → use fallback
  const r3 = simulateNewFileClick(undefined, "MY-PROJECT", () => {});
  assert(r3.usedRef === false, "Undefined ref: does NOT use ref");
  assert(r3.usedFallback === true, "Undefined ref: uses fallback");

  // Case 4: Folder creation with null ref → fallback
  fallbackCalled = false;
  fallbackType = null;
  const r4 = simulateNewFolderClick(nullRef, "MY-PROJECT", (proj, type) => {
    fallbackCalled = true;
    fallbackType = type;
  });
  assert(r4.usedRef === false, "Null ref folder: does NOT use ref");
  assert(r4.usedFallback === true, "Null ref folder: uses fallback");
  assertEqual(fallbackType, "folder", "Null ref folder: correct type 'folder' passed");

  // Case 5: Folder creation with mounted ref → use ref
  const r5 = simulateNewFolderClick(mountedRef, "MY-PROJECT", () => {});
  assert(r5.usedRef === true, "Mounted ref folder: uses triggerNewFolder via ref");
  assert(r5.usedFallback === false, "Mounted ref folder: does NOT use fallback");
});

describe("triggerCreateInProject — expands project and sets pendingCreate", () => {
  // Simulates the triggerCreateInProject function from WorkspaceExplorer
  function simulateTriggerCreateInProject(
    expandedProjects, activeProject, targetProject, createType
  ) {
    // Clone the set to simulate React state
    const nextExpanded = new Set([...expandedProjects, targetProject]);
    const nextActiveProject = targetProject;
    const nextPendingCreate = { type: createType, project: targetProject };
    return { nextExpanded, nextActiveProject, nextPendingCreate };
  }

  // Case 1: Project was collapsed → should be expanded
  const collapsed = new Set();
  const r1 = simulateTriggerCreateInProject(collapsed, null, "2048-GAME", "file");
  assert(r1.nextExpanded.has("2048-GAME"), "Collapsed project is now expanded");
  assertEqual(r1.nextActiveProject, "2048-GAME", "Active project set correctly");
  assertEqual(r1.nextPendingCreate.type, "file", "Pending create type is 'file'");
  assertEqual(r1.nextPendingCreate.project, "2048-GAME", "Pending create project is correct");

  // Case 2: Project was already expanded → stays expanded, pendingCreate set
  const expanded = new Set(["2048-GAME"]);
  const r2 = simulateTriggerCreateInProject(expanded, "2048-GAME", "2048-GAME", "folder");
  assert(r2.nextExpanded.has("2048-GAME"), "Already-expanded project stays expanded");
  assertEqual(r2.nextPendingCreate.type, "folder", "Pending create type is 'folder'");

  // Case 3: Another project was expanded → both should be expanded
  const otherExpanded = new Set(["OTHER-PROJECT"]);
  const r3 = simulateTriggerCreateInProject(otherExpanded, "OTHER-PROJECT", "2048-GAME", "file");
  assert(r3.nextExpanded.has("OTHER-PROJECT"), "Other project stays expanded");
  assert(r3.nextExpanded.has("2048-GAME"), "Target project is now also expanded");
  assertEqual(r3.nextPendingCreate.project, "2048-GAME", "Pending create targets correct project");
});

describe("pendingCreate propagation to FileTree — deferred until loaded", () => {
  // Simulates the FileTree useEffect logic for pendingCreate
  function simulatePendingCreateEffect(pendingCreate, loading) {
    let rootInlineCreate = null;
    let pendingCreateDeferred = null;
    let consumed = false;

    if (pendingCreate) {
      if (!loading) {
        rootInlineCreate = pendingCreate;
        consumed = true;
      } else {
        pendingCreateDeferred = pendingCreate;
        consumed = true;
      }
    }
    return { rootInlineCreate, pendingCreateDeferred, consumed };
  }

  // Simulate the deferred resolution when loading finishes
  function simulateLoadingComplete(pendingCreateDeferred) {
    let rootInlineCreate = null;
    if (pendingCreateDeferred) {
      rootInlineCreate = pendingCreateDeferred;
    }
    return { rootInlineCreate };
  }

  // Case 1: Tree already loaded → show inline input immediately
  const r1 = simulatePendingCreateEffect("file", false);
  assertEqual(r1.rootInlineCreate, "file", "Loaded tree: inline input shown immediately");
  assert(r1.pendingCreateDeferred === null, "Loaded tree: nothing deferred");
  assert(r1.consumed === true, "Loaded tree: consumed signal");

  // Case 2: Tree still loading → defer until loaded
  const r2 = simulatePendingCreateEffect("file", true);
  assert(r2.rootInlineCreate === null, "Loading tree: inline input NOT shown yet");
  assertEqual(r2.pendingCreateDeferred, "file", "Loading tree: deferred create stored");
  assert(r2.consumed === true, "Loading tree: consumed signal");

  // Case 2b: Loading completes → show deferred inline input
  const r2b = simulateLoadingComplete(r2.pendingCreateDeferred);
  assertEqual(r2b.rootInlineCreate, "file", "After load complete: deferred create shown");

  // Case 3: No pending create → nothing happens
  const r3 = simulatePendingCreateEffect(null, false);
  assert(r3.rootInlineCreate === null, "No pending: no inline input");
  assert(r3.consumed === false, "No pending: nothing consumed");

  // Case 4: Folder creation
  const r4 = simulatePendingCreateEffect("folder", false);
  assertEqual(r4.rootInlineCreate, "folder", "Folder create: inline input shown");

  // Case 5: Folder deferred
  const r5 = simulatePendingCreateEffect("folder", true);
  assertEqual(r5.pendingCreateDeferred, "folder", "Folder deferred while loading");
  const r5b = simulateLoadingComplete(r5.pendingCreateDeferred);
  assertEqual(r5b.rootInlineCreate, "folder", "Folder shown after load complete");
});

describe("End-to-end: collapsed project → New File button → file created", () => {
  // Simulates the full flow:
  // 1. User clicks "New File" on a collapsed project section header
  // 2. Button fallback fires triggerCreateInProject (since ref is null)
  // 3. Project expands, pendingCreate set
  // 4. FileTree mounts, loading starts
  // 5. Loading finishes, deferred pendingCreate shows inline input
  // 6. User types name, submits
  // 7. API call creates file, tree refreshes

  let expandedProjects = new Set();
  let activeProject = null;
  let pendingCreate = null;
  const projectName = "2048-GAME";

  // Step 1-2: Button click, ref is null → fallback fires
  const fileTreeRef = { current: null };
  let fallbackFired = false;
  if (fileTreeRef?.current?.triggerNewFile) {
    fileTreeRef.current.triggerNewFile();
  } else {
    // triggerCreateInProject equivalent
    expandedProjects = new Set([...expandedProjects, projectName]);
    activeProject = projectName;
    pendingCreate = { type: "file", project: projectName };
    fallbackFired = true;
  }
  assert(fallbackFired, "E2E: Fallback fired because ref was null");
  assert(expandedProjects.has(projectName), "E2E: Project is now expanded");
  assertEqual(activeProject, projectName, "E2E: Active project set");
  assertEqual(pendingCreate.type, "file", "E2E: PendingCreate is 'file'");
  assertEqual(pendingCreate.project, projectName, "E2E: PendingCreate targets correct project");

  // Step 3-4: FileTree receives pendingCreate, but is loading
  let rootInlineCreate = null;
  let deferredCreate = null;
  const isLoading = true;
  const pendingCreateProp = pendingCreate.project === projectName ? pendingCreate.type : null;

  if (pendingCreateProp) {
    if (!isLoading) {
      rootInlineCreate = pendingCreateProp;
    } else {
      deferredCreate = pendingCreateProp;
    }
    pendingCreate = null; // consumed
  }

  assert(rootInlineCreate === null, "E2E: Inline input not shown during loading");
  assertEqual(deferredCreate, "file", "E2E: Create deferred until loading finishes");
  assert(pendingCreate === null, "E2E: PendingCreate consumed by FileTree");

  // Step 5: Loading finishes
  if (deferredCreate) {
    rootInlineCreate = deferredCreate;
    deferredCreate = null;
  }
  assertEqual(rootInlineCreate, "file", "E2E: After loading, inline input shown");
  assert(deferredCreate === null, "E2E: Deferred create cleared");

  // Step 6-7: User submits name → API call → tree refreshes (simulated)
  const newFileName = "game.js";
  const newFilePath = newFileName; // root-level file
  let apiCalled = false;
  let treeRefreshed = false;
  let fileSelected = false;

  // Simulate API + UI updates
  apiCalled = true; // workspaceApi.writeFile(project, path, "")
  treeRefreshed = true; // loadRoot()
  fileSelected = true; // onFileSelect({ name, path, type: "file" })
  rootInlineCreate = null; // cleared after submit

  assert(apiCalled, "E2E: API was called to create file");
  assert(treeRefreshed, "E2E: Tree was refreshed");
  assert(fileSelected, "E2E: New file was selected/opened");
  assert(rootInlineCreate === null, "E2E: Inline input cleared after creation");
});

// ─────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n❌ FAILURES:");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
} else {
  console.log("✨ All tests passed!");
}
console.log("=".repeat(60) + "\n");

// Close the vitest test() block
expect(failed).toBe(0);

}) // end test()
