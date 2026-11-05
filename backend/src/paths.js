// Shared path classification used by the analyzer, git-history and originality
// modules so "what counts as student-written code" stays consistent.

const GENERATED_DIR = /(?:^|\/)(?:node_modules|bower_components|vendor|venv|\.venv|virtualenv|__pycache__|dist|build|out|target|coverage|\.next|\.nuxt|\.cache|\.parcel-cache|migrations|site-packages|third_party|external|libs?\/vendor)\//i;

const GENERATED_FILE = /(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|poetry\.lock|Pipfile\.lock|composer\.lock|Cargo\.lock|Gemfile\.lock|go\.sum|\.min\.(?:js|css)|\.bundle\.js|\.chunk\.js|\.map|\.pb\.go|_pb2\.py|_pb2_grpc\.py|\.generated\.[\w]+|\.g\.dart|\.freezed\.dart)$/i;

// Artifacts that should never be committed to a student repository.
const ARTIFACT_RULES = [
  { re: /(?:^|\/)node_modules\//, label: "node_modules/", kind: "dependencies" },
  { re: /(?:^|\/)bower_components\//, label: "bower_components/", kind: "dependencies" },
  { re: /(?:^|\/)(?:venv|\.venv|virtualenv|env)\/(?:bin|lib|Scripts|Include)\//i, label: "Python virtualenv", kind: "dependencies" },
  { re: /(?:^|\/)__pycache__\//, label: "__pycache__/", kind: "build output" },
  { re: /\.pyc$/, label: "*.pyc", kind: "build output" },
  { re: /(?:^|\/)(?:dist|build|out)\//, label: "build output folder", kind: "build output" },
  { re: /(?:^|\/)target\/(?:classes|test-classes)\//, label: "target/classes", kind: "build output" },
  { re: /\.class$/, label: "*.class", kind: "build output" },
  { re: /(?:^|\/)coverage\//, label: "coverage/", kind: "build output" },
  { re: /(?:^|\/)\.idea\//, label: ".idea/", kind: "editor config" },
  { re: /(?:^|\/)\.vscode\//, label: ".vscode/", kind: "editor config" },
  { re: /(?:^|\/)\.DS_Store$/, label: ".DS_Store", kind: "OS junk" },
  { re: /(?:^|\/)Thumbs\.db$/i, label: "Thumbs.db", kind: "OS junk" },
  { re: /(?:^|\/)\.env(?:\.(?!example|sample|template|dist)[\w.-]+)?$/, label: ".env", kind: "secrets" },
  { re: /\.(?:log)$/i, label: "*.log", kind: "logs" },
  { re: /\.(?:zip|rar|7z|tar|tgz|gz)$/i, label: "archive", kind: "archive" },
  { re: /\.(?:exe|dll|so|dylib|jar|war)$/i, label: "binary", kind: "binary" },
];

const BOT_RE = /\[bot\]|^(?:dependabot|github-actions|renovate|greenkeeper|snyk-bot|semantic-release|imgbot|allcontributors|codecov|mergify|stale)(?:\[bot\])?$/i;

function isGeneratedPath(relPath) {
  return GENERATED_DIR.test(relPath) || GENERATED_FILE.test(relPath);
}

function classifyArtifact(relPath) {
  for (const rule of ARTIFACT_RULES) {
    if (rule.re.test(relPath)) return { label: rule.label, kind: rule.kind };
  }
  return null;
}

function isBotAuthor(name, email) {
  return BOT_RE.test(String(name || "").trim()) || BOT_RE.test(String(email || "").split("@")[0]);
}

module.exports = { isGeneratedPath, classifyArtifact, isBotAuthor };
