const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeManifestSignature,
  findExternalReferences,
  isScannableFile,
  walkRelevantFiles
} = require('../scripts/validate-hard-import');

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
});
