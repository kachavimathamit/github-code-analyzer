// Distinguishes student-written code from generated scaffolding, and compares a
// submission's code fingerprint against previously analyzed repositories.

const { isGeneratedPath } = require("./paths");

const TEMPLATES = [
  {
    name: "Create React App",
    markers: [/^src\/reportWebVitals\.[jt]sx?$/, /^src\/setupTests\.[jt]sx?$/],
    boilerplate: [/^src\/(?:reportWebVitals|setupTests|App\.test|index|serviceWorker)\.[jt]sx?$/, /^public\//],
  },
  {
    name: "Vite starter",
    markers: [/^vite\.config\.[jt]s$/],
    boilerplate: [/^src\/(?:main|vite-env\.d)\.[jt]sx?$/, /^public\//, /^index\.html$/],
  },
  {
    name: "Next.js",
    markers: [/^next\.config\.[mc]?[jt]s$/],
    boilerplate: [/^(?:pages|app)\/(?:_app|_document|layout|globals?)\.[jt]sx?$/, /^public\//],
  },
  {
    name: "Angular CLI",
    markers: [/^angular\.json$/],
    boilerplate: [/^src\/(?:main|polyfills|environments\/.*)\.ts$/, /^src\/assets\//],
  },
  {
    name: "Django",
    markers: [/^manage\.py$/],
    boilerplate: [/(?:^|\/)(?:wsgi|asgi|manage)\.py$/, /(?:^|\/)migrations\//, /(?:^|\/)admin\.py$/, /(?:^|\/)apps\.py$/],
  },
  {
    name: "Spring Initializr",
    markers: [/^mvnw$/, /^gradlew$/],
    boilerplate: [/^(?:mvnw|gradlew)(?:\.bat|\.cmd)?$/, /^gradle\/wrapper\//, /^\.mvn\//],
  },
  {
    name: "Express generator",
    markers: [/^bin\/www$/],
    boilerplate: [/^bin\/www$/, /^public\/stylesheets\//],
  },
  {
    name: "Android Studio",
    markers: [/^gradlew$/, /^app\/build\.gradle(?:\.kts)?$/],
    boilerplate: [/^gradle\/wrapper\//, /^gradlew(?:\.bat)?$/, /^app\/src\/(?:androidTest|test)\/.*ExampleInstrumented|ExampleUnit/],
  },
  {
    name: "Flutter",
    markers: [/^pubspec\.yaml$/, /^lib\/main\.dart$/],
    boilerplate: [/^(?:android|ios|web|windows|macos|linux)\//, /^test\/widget_test\.dart$/],
  },
];

// Config and tooling files that are rarely written from scratch by students.
const COMMON_BOILERPLATE = [
  /^(?:\.eslintrc|\.prettierrc|\.editorconfig|\.babelrc|\.nvmrc|\.browserslistrc)/,
  /^(?:tsconfig|jsconfig|vite\.config|webpack\.config|rollup\.config|babel\.config|jest\.config|tailwind\.config|postcss\.config|next\.config|angular|nest-cli|vue\.config)\.\w+$/,
  /^(?:Dockerfile|docker-compose\.ya?ml|Procfile|netlify\.toml|vercel\.json|\.dockerignore|\.gitattributes)$/i,
  /^\.github\//,
  /^(?:LICENSE|LICENCE|COPYING)/i,
];

function detectTemplates(allRel) {
  const relSet = allRel;
  const detected = [];
  for (const tpl of TEMPLATES) {
    const hits = tpl.markers.filter((re) => relSet.some((p) => re.test(p))).length;
    if (hits === 0) continue;
    detected.push({ name: tpl.name, confidence: hits === tpl.markers.length ? "high" : "likely", patterns: tpl.boilerplate });
  }
  return detected;
}

function classifyFiles(fileRecords, templates, singleTouchFiles) {
  const templatePatterns = templates.flatMap((t) => t.patterns);
  const untouched = new Set(singleTouchFiles || []);

  let boilerplateFiles = 0;
  let boilerplateLines = 0;
  let generatedFiles = 0;
  let generatedLines = 0;
  let effectiveFiles = 0;
  let effectiveLines = 0;
  let testLines = 0;
  const boilerplateSet = new Set();
  const samples = [];

  for (const f of fileRecords) {
    if (f.isTest) {
      testLines += f.codeLines;
      continue;
    }
    if (isGeneratedPath(f.path)) {
      generatedFiles++;
      generatedLines += f.codeLines;
      boilerplateSet.add(f.path);
      continue;
    }
    const isTemplate = templatePatterns.some((re) => re.test(f.path)) || COMMON_BOILERPLATE.some((re) => re.test(f.path));
    if (isTemplate) {
      boilerplateFiles++;
      boilerplateLines += f.codeLines;
      boilerplateSet.add(f.path);
      if (samples.length < 10 && f.codeLines > 0) samples.push({ path: f.path, lines: f.codeLines });
      continue;
    }
    effectiveFiles++;
    effectiveLines += f.codeLines;
  }

  const untouchedRecords = fileRecords.filter((f) => !f.isTest && !boilerplateSet.has(f.path) && untouched.has(f.path));

  return {
    boilerplateFiles,
    boilerplateLines,
    generatedFiles,
    generatedLines,
    effectiveFiles,
    effectiveLines,
    testLines,
    boilerplateSet,
    boilerplateSamples: samples,
    untouchedFiles: untouchedRecords.length,
    untouchedLines: untouchedRecords.reduce((s, f) => s + f.codeLines, 0),
    untouchedSamples: untouchedRecords.sort((a, b) => b.codeLines - a.codeLines).slice(0, 8).map((f) => ({ path: f.path, lines: f.codeLines })),
  };
}

function analyzeOriginality({ allRel, fileRecords, fingerprintsByFile, singleTouchFiles, repoUrl, store }) {
  const templates = detectTemplates(allRel);
  const breakdown = classifyFiles(fileRecords, templates, singleTouchFiles);

  // Fingerprint only student-written code so two CRA projects do not look identical.
  const hashes = new Set();
  for (const [file, list] of fingerprintsByFile) {
    if (breakdown.boilerplateSet.has(file)) continue;
    for (const h of list) {
      hashes.add(h);
      if (hashes.size >= 6000) break;
    }
    if (hashes.size >= 6000) break;
  }
  const fingerprint = [...hashes];

  let similar = [];
  if (store && fingerprint.length >= 20) {
    try {
      similar = store.findSimilar(fingerprint, repoUrl);
    } catch {
      similar = [];
    }
  }

  const totalNonTest = breakdown.effectiveLines + breakdown.boilerplateLines + breakdown.generatedLines;

  return {
    templates: templates.map((t) => ({ name: t.name, confidence: t.confidence })),
    effectiveCodeLines: breakdown.effectiveLines,
    effectiveFiles: breakdown.effectiveFiles,
    boilerplateLines: breakdown.boilerplateLines,
    boilerplateFiles: breakdown.boilerplateFiles,
    generatedLines: breakdown.generatedLines,
    generatedFiles: breakdown.generatedFiles,
    testLines: breakdown.testLines,
    effectivePercent: totalNonTest ? Math.round((breakdown.effectiveLines / totalNonTest) * 1000) / 10 : null,
    boilerplateSamples: breakdown.boilerplateSamples,
    untouchedFiles: breakdown.untouchedFiles,
    untouchedLines: breakdown.untouchedLines,
    untouchedSamples: breakdown.untouchedSamples,
    fingerprintBlocks: fingerprint.length,
    similarSubmissions: similar,
    fingerprint,
  };
}

module.exports = { analyzeOriginality };
