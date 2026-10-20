import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

function inspect(example, expectedStatus, expectedRules) {
  const result = spawnSync(
    process.execPath,
    [cli, 'inspect', example, '--format', 'json', '--fail-on', 'high'],
    { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${example}: terminated by signal`);
  assert.equal(result.status, expectedStatus, `${example}: ${result.stderr}`);
  assert.equal(result.stderr, '', `${example}: unexpected stderr`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, 1);
  assert.equal(report.complete, true, `${example}: incomplete report`);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(
    [...new Set(report.findings.map((finding) => finding.ruleId))].sort(),
    expectedRules,
    `${example}: unexpected diagnostic rules`,
  );
  console.log(
    `${example}: exit ${expectedStatus}; rules ${expectedRules.join(', ') || 'none'}`,
  );
}

// Only checked-in synthetic fixtures; no downloads, credentials, or live traces.
inspect('examples/healthy/basic.json', 0, []);
inspect('examples/suspicious/retries.json', 2, ['AWI002', 'AWI004', 'AWI006']);
console.log('Quickstart verification passed.');
