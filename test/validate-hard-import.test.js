const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const yaml = require('js-yaml');
const {
  buildReport,
  collectExpiredEntries,
  computeManifestSignature,
  findExternalReferences,
  isExpired,
  isScannableFile,
  walkRelevantFiles
} = require('../scripts/validate-hard-import');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adr-047-'));
}

test('computeManifestSignature ignores the stored signature field', () => {
  const manifest = {
    version: '1.0',
    manifest_signature: 'sha256:placeholder',
    authorized_runtime_references: []
  };

  const first = computeManifestSignature(manifest);
  manifest.manifest_signature = 'sha256:changed';
  const second = computeManifestSignature(manifest);

  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test('findExternalReferences reports external package scopes and github urls', () => {
  const references = findExternalReferences(
    "import x from '@external-org/pkg';\nrepo = 'https://github.com/example-org/example'\nimport ok from '@silence-agents-org/internal'",
    'scripts/example.js'
  );

  assert.deepEqual(
    references.map(({ reference }) => reference).sort(),
    ['@external-org/pkg', 'github.com/example-org/example']
  );
});

test('isScannableFile accepts policy-sensitive files', () => {
  assert.equal(isScannableFile('.github/workflows/hard-import-validation.yml'), true);
  assert.equal(isScannableFile('pyproject.toml'), true);
  assert.equal(isScannableFile('test/validate-hard-import.test.js'), false);
  assert.equal(isScannableFile('node_modules/pkg/index.js'), false);
});

test('walkRelevantFiles skips docs and tests but includes enforcement files', () => {
  const files = walkRelevantFiles(process.cwd());

  assert.equal(files.includes('docs/HARD_IMPORT_POLICY.md'), false);
  assert.equal(files.includes('test/validate-hard-import.test.js'), false);
  assert.equal(files.includes('scripts/validate-hard-import.js'), true);
  assert.equal(files.includes('.github/workflows/hard-import-validation.yml'), true);
  assert.equal(files.includes('package.json'), true);
  assert.equal(files.includes('HARD_IMPORT.manifest.yml'), true);
});

test('isExpired handles YAML Date objects and ISO strings', () => {
  assert.equal(isExpired(new Date('2026-09-18T00:00:00Z'), '2026-09-19'), true);
  assert.equal(isExpired('2026-09-19', '2026-09-19'), false);
  assert.equal(isExpired('not-a-date', '2026-09-19'), false);
});

test('buildReport emits WORLDHALT for expired entries', () => {
  const report = buildReport({
    manifest: {
      manifest_signature: 'sha256:test',
      authorized_runtime_references: [],
      deprecated_imports: []
    },
    signatureValid: true,
    expiredEntries: [{ to_module: '@external-org/pkg', expiry: new Date('2026-09-18T00:00:00Z') }],
    files: ['package.json'],
    references: [],
    today: '2026-09-19'
  });

  assert.equal(report.exit_code, 99);
  assert.equal(report.worldhalt, true);
  assert.equal(report.violations[0].trigger, 'passive_expired_import');
});

test('collectExpiredEntries includes expired deprecated imports', () => {
  const expiredEntries = collectExpiredEntries(
    {
      authorized_runtime_references: [],
      deprecated_imports: [{ from_org: 'external-org', removal_date: '2026-09-18' }]
    },
    '2026-09-19'
  );

  assert.equal(expiredEntries.length, 1);
  assert.equal(expiredEntries[0].expired_type, 'deprecated_import');
});

test('verify-signature-only CLI branch writes a success report', () => {
  const tempDir = makeTempDir();
  const reportPath = path.join(tempDir, 'signature-report.json');

  try {
    const result = cp.spawnSync('node', ['scripts/validate-hard-import.js', '--verify-signature-only'], {
      cwd: process.cwd(),
      env: { ...process.env, VALIDATION_REPORT_PATH: reportPath },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.signature_valid, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('check-expiry-only CLI branch writes a success report', () => {
  const tempDir = makeTempDir();
  const reportPath = path.join(tempDir, 'expiry-report.json');

  try {
    const result = cp.spawnSync('node', ['scripts/validate-hard-import.js', '--check-expiry-only'], {
      cwd: process.cwd(),
      env: { ...process.env, VALIDATION_REPORT_PATH: reportPath },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.deepEqual(report.expired_entries, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('verify-signature-only CLI branch fails with exit 99 for invalid signatures', () => {
  const tempDir = makeTempDir();
  const manifestPath = path.join(tempDir, 'invalid-signature.manifest.yml');
  const reportPath = path.join(tempDir, 'invalid-signature-report.json');

  try {
    fs.writeFileSync(
      manifestPath,
      yaml.dump({
        version: '1.0',
        policy: 'receiver-side-validation',
        organization: 'silence-agents-org',
        manifest_signature: 'sha256:invalid',
        manifest_last_updated: '2026-09-19',
        authorized_runtime_references: [],
        deprecated_imports: [],
        worldhalt_triggers: {}
      })
    );

    const result = cp.spawnSync(
      'node',
      ['scripts/validate-hard-import.js', '--verify-signature-only', `--manifest-path=${manifestPath}`],
      {
        cwd: process.cwd(),
        env: { ...process.env, VALIDATION_REPORT_PATH: reportPath },
        encoding: 'utf8'
      }
    );

    assert.equal(result.status, 99);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.signature_valid, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('check-expiry-only CLI branch fails with exit 99 for expired entries', () => {
  const tempDir = makeTempDir();
  const manifestPath = path.join(tempDir, 'expired.manifest.yml');
  const reportPath = path.join(tempDir, 'expired-report.json');

  try {
    const manifest = {
      version: '1.0',
      policy: 'receiver-side-validation',
      organization: 'silence-agents-org',
      manifest_signature: 'sha256:placeholder',
      manifest_last_updated: '2026-09-19',
      authorized_runtime_references: [
        {
          from_org: 'external-org',
          to_module: '@external-org/pkg',
          reference_type: 'RUNTIME_REFERENCE',
          approved_date: '2026-09-01',
          approved_by: 'owner',
          purpose: 'test',
          expiry: '2026-09-18'
        }
      ],
      deprecated_imports: [],
      worldhalt_triggers: {}
    };
    manifest.manifest_signature = computeManifestSignature(manifest);
    fs.writeFileSync(manifestPath, yaml.dump(manifest));

    const result = cp.spawnSync(
      'node',
      ['scripts/validate-hard-import.js', '--check-expiry-only', `--manifest-path=${manifestPath}`],
      {
        cwd: process.cwd(),
        env: { ...process.env, VALIDATION_REPORT_PATH: reportPath },
        encoding: 'utf8'
      }
    );

    assert.equal(result.status, 99);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.expired_entries.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
