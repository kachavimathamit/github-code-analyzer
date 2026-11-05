// Lightweight hardcoded-secret scanner. Matched values are masked and never
// stored in full.

const RULES = [
  { type: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: "high" },
  { type: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: "high" },
  { type: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: "high" },
  { type: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "high" },
  { type: "Stripe live key", re: /\b[sr]k_live_[0-9a-zA-Z]{16,}\b/, severity: "high" },
  { type: "Private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, severity: "high" },
  { type: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, severity: "medium" },
  {
    type: "Hardcoded credential",
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i,
    severity: "medium",
    generic: true,
  },
];

const PLACEHOLDER = /^(?:your|example|sample|changeme|change_me|placeholder|dummy|test|fake|mock|xxx|todo|none|null|undefined|\*+|<|\$\{|\{\{|%\(|process\.env|os\.environ|env\.)/i;

const SKIP_FILE = /(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|poetry\.lock|\.min\.(?:js|css)|\.map|\.md|\.svg|\.snap)$/i;
const SENSITIVE_FILE = /(?:^|\/)(?:\.env(?:\.(?!example|sample|template|dist)[\w.-]+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]+\.(?:pem|pfx|p12|jks|keystore))$/i;

function mask(value) {
  if (value.length <= 8) return value.slice(0, 2) + "****";
  return value.slice(0, 4) + "****" + value.slice(-2);
}

function scanFilename(relPath, isTest) {
  if (SENSITIVE_FILE.test(relPath)) {
    return { file: relPath, line: null, type: "Sensitive file committed", severity: isTest ? "low" : "medium", preview: relPath.split("/").pop(), inTests: isTest };
  }
  return null;
}

function scanSecrets(relPath, text, isTest) {
  if (SKIP_FILE.test(relPath)) return [];
  const findings = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 600) continue;
    for (const rule of RULES) {
      if (rule.generic && isTest) continue;
      const m = line.match(rule.re);
      if (!m) continue;
      const value = rule.generic ? m[1] : m[0];
      if (rule.generic && (PLACEHOLDER.test(value) || /^(.)\1+$/.test(value) || /[()]/.test(value))) continue;
      findings.push({
        file: relPath,
        line: i + 1,
        type: rule.type,
        severity: isTest ? "low" : rule.severity,
        preview: rule.type === "Private key" ? "-----BEGIN ... PRIVATE KEY-----" : mask(value),
        inTests: isTest,
      });
      break;
    }
  }
  return findings;
}

module.exports = { scanSecrets, scanFilename };
