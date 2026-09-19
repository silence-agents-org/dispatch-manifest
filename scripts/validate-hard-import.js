#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'HARD_IMPORT.manifest.yml');
const REPORT_PATH = path.join(REPO_ROOT, 'validation-report.json');
const INTERNAL_ORG = 'silence-agents-org';
const SCANNABLE_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.py', '.rs', '.json', '.yaml', '.yml', '.toml'
]);
const SCANNABLE_BASENAMES = new Set([
  '.dependency-cruiser.js', 'package.json', 'Cargo.toml', 'setup.py', 'pyproject.toml',
  'requirements.txt', 'pnpm-workspace.yaml', 'turbo.json', 'Dockerfile', 'docker-compose.yml',
  'HARD_IMPORT.manifest.yml'
]);
const SCANNABLE_PREFIXES = ['src/', 'lib/', 'scripts/', '.github/workflows/', '.husky/', 'policy/'];
const PACKAGE_SCOPE_PATTERN = /@([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
const GITHUB_ORG_PATTERN = /(?:github\.com[/:])([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortDeep(value[key]);
        return result;
      }, {});
  }
  return value;
}

function computeManifestSignature(manifest) {
  const clone = JSON.parse(JSON.stringify(manifest || {}));
  clone.manifest_signature = '';
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(sortDeep(clone))).digest('hex')}`;
}

function loadManifest() {
  return yaml.load(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function listFiles(stagedOnly) {
  if (!stagedOnly) {
    return walkRelevantFiles(REPO_ROOT);
  }

  const stdout = cp.execSync('git diff --cached --name-only --diff-filter=ACMR', {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  }).trim();
  if (!stdout) {
    return [];
  }
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => isScannableFile(file));
}

function isScannableFile(file) {
  if (file.startsWith('node_modules/') || file.startsWith('vendor/') || file.startsWith('.generated/')) {
    return false;
  }
  const base = path.basename(file);
  if (SCANNABLE_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return SCANNABLE_EXTENSIONS.has(path.extname(file)) || file === '.husky/pre-commit';
  }
  if (SCANNABLE_BASENAMES.has(base)) {
    return true;
  }
  if (base.startsWith('requirements') && base.endsWith('.txt')) {
    return true;
  }
  return false;
}

function walkRelevantFiles(rootDir) {
  const files = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'vendor', '.generated', 'docs', 'test'].includes(entry.name)) {
      continue;
    }
    const absolutePath = path.join(rootDir, entry.name);
    const relativePath = path.relative(REPO_ROOT, absolutePath);

    if (entry.isDirectory()) {
      const directoryPath = `${relativePath}/`;
      if (!SCANNABLE_PREFIXES.some((prefix) => prefix.startsWith(directoryPath) || directoryPath.startsWith(prefix))) {
        continue;
      }
      files.push(...walkRelevantFiles(absolutePath));
      continue;
    }

    if (isScannableFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function makeEntryMap(entries) {
  return new Map((entries || []).map((entry) => [entry.to_module, entry]));
}

function collectMatches(content, pattern, mapper) {
  const matches = [];
  for (const match of content.matchAll(pattern)) {
    matches.push(mapper(match));
  }
  return matches;
}

function findExternalReferences(content, file) {
  const scopedPackages = collectMatches(content, PACKAGE_SCOPE_PATTERN, (match) => ({
    file,
    reference: `@${match[1]}/${match[2]}`,
    org: match[1],
    type: 'package-scope'
  }));
  const githubRefs = collectMatches(content, GITHUB_ORG_PATTERN, (match) => ({
    file,
    reference: `github.com/${match[1]}/${match[2]}`,
    org: match[1],
    type: 'github-url'
  }));
  return [...scopedPackages, ...githubRefs].filter((entry) => entry.org !== INTERNAL_ORG);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const asString = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function isExpired(dateValue, today) {
  const normalizedDate = normalizeDate(dateValue);
  const normalizedToday = normalizeDate(today);
  return Boolean(normalizedDate && normalizedToday) && normalizedDate < normalizedToday;
}

function isRestrictedFile(entry, file) {
  const restricted = entry.restricted_to_modules || [];
  return restricted.length > 0 && !restricted.includes(file);
}

function buildReport({ manifest, signatureValid, expiredEntries, files, references, today }) {
  const authorizedMap = makeEntryMap(manifest.authorized_runtime_references);
  const deprecated = manifest.deprecated_imports || [];
  const violations = [];
  const warnings = [];

  if (!signatureValid) {
    violations.push({
      file: 'HARD_IMPORT.manifest.yml',
      trigger: 'signature_mismatch',
      message: 'Manifest signature mismatch.'
    });
  }

  for (const entry of expiredEntries) {
    violations.push({
      file: 'HARD_IMPORT.manifest.yml',
      trigger: 'passive_expired_import',
      message: `Expired authorized runtime reference: ${entry.to_module || entry.from_org || 'unknown'}`
    });
  }

  for (const reference of references) {
    const authorization = authorizedMap.get(reference.reference);
    const deprecatedEntry = deprecated.find((entry) => entry.from_org === reference.org);

    if (deprecatedEntry) {
      warnings.push({
        file: reference.file,
        reference: reference.reference,
        trigger: 'deprecated_import',
        message: `Deprecated import from ${reference.org}; removal date ${deprecatedEntry.removal_date || 'unspecified'}.`
      });
    }

    if (!authorization) {
      violations.push({
        file: reference.file,
        reference: reference.reference,
        trigger: 'missing_approval',
        message: 'ADR-047: Cross-org HARD_IMPORT strictly forbidden. Use RUNTIME_REFERENCE only.'
      });
      continue;
    }

    if (authorization.reference_type !== 'RUNTIME_REFERENCE') {
      violations.push({
        file: reference.file,
        reference: reference.reference,
        trigger: 'unknown_org_reference',
        message: `Unsupported reference type ${authorization.reference_type || 'undefined'} for ${reference.reference}.`
      });
    }

    if (isExpired(authorization.expiry, today)) {
      violations.push({
        file: reference.file,
        reference: reference.reference,
        trigger: 'expired_entry_in_use',
        message: `Expired runtime reference used in code: ${reference.reference}`
      });
    }

    if (isRestrictedFile(authorization, reference.file)) {
      violations.push({
        file: reference.file,
        reference: reference.reference,
        trigger: 'missing_approval',
        message: `Reference ${reference.reference} is not approved for ${reference.file}.`
      });
    }
  }

  const exitCode = violations.length > 0 ? 99 : warnings.length > 0 ? 1 : 0;
  return {
    timestamp: new Date().toISOString(),
    success: exitCode === 0,
    exit_code: exitCode,
    worldhalt: exitCode === 99,
    today,
    scanned_files: files,
    signature_valid: signatureValid,
    manifest_signature: manifest.manifest_signature,
    computed_signature: computeManifestSignature(manifest),
    violations,
    warnings,
    expired_entries: expiredEntries,
    references
  };
}

function writeReport(report, reportPath = REPORT_PATH) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printSummary(report) {
  console.log(JSON.stringify(report, null, 2));
}

function main(argv = process.argv.slice(2)) {
  const stagedOnly = argv.includes('--staged');
  const verifySignatureOnly = argv.includes('--verify-signature-only');
  const checkExpiryOnly = argv.includes('--check-expiry-only');
  const manifest = loadManifest();
  const today = new Date().toISOString().slice(0, 10);
  const signatureValid = manifest.manifest_signature === computeManifestSignature(manifest);
  const expiredEntries = (manifest.authorized_runtime_references || []).filter((entry) => isExpired(entry.expiry, today));

  if (verifySignatureOnly) {
    const report = {
      timestamp: new Date().toISOString(),
      success: signatureValid,
      exit_code: signatureValid ? 0 : 99,
      worldhalt: !signatureValid,
      signature_valid: signatureValid,
      manifest_signature: manifest.manifest_signature,
      computed_signature: computeManifestSignature(manifest)
    };
    writeReport(report);
    printSummary(report);
    process.exit(report.exit_code);
  }

  if (checkExpiryOnly) {
    const report = {
      timestamp: new Date().toISOString(),
      success: expiredEntries.length === 0,
      exit_code: expiredEntries.length === 0 ? 0 : 99,
      worldhalt: expiredEntries.length > 0,
      expired_entries: expiredEntries
    };
    writeReport(report);
    printSummary(report);
    process.exit(report.exit_code);
  }

  const files = listFiles(stagedOnly);
  const references = files.flatMap((file) => {
    const fullPath = path.join(REPO_ROOT, file);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return [];
    }
    return findExternalReferences(fs.readFileSync(fullPath, 'utf8'), file);
  });
  const report = buildReport({ manifest, signatureValid, expiredEntries, files, references, today });
  writeReport(report);
  printSummary(report);
  process.exit(report.exit_code);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReport,
  computeManifestSignature,
  findExternalReferences,
  isExpired,
  isScannableFile,
  main,
  normalizeDate,
  sortDeep,
  walkRelevantFiles
};
