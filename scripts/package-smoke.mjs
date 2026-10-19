import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.');
const scratch = mkdtempSync(join(root, '.awi-smoke-'));
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run with pnpm smoke:package');
function run(args, cwd = root) {
  return execFileSync(process.execPath, [pnpm, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}
try {
  const archive = join(scratch, 'awi.tgz');
  run(['pack', '--out', archive]);
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'awi-smoke', private: true, type: 'module' }),
  );
  run(['--ignore-workspace', 'add', archive, '--ignore-scripts'], scratch);
  assert.equal(run(['exec', 'awi', '--version'], scratch).trim(), '1.0.0');
  const healthy = run(
    [
      'exec',
      'awi',
      'inspect',
      join(root, 'examples/healthy/basic.json'),
      '--format',
      'json',
    ],
    scratch,
  );
  assert.equal(JSON.parse(healthy).findings.length, 0);
  const suspicious = spawnSync(
    process.execPath,
    [
      pnpm,
      'exec',
      'awi',
      'inspect',
      join(root, 'examples/suspicious/retries.json'),
      '--format',
      'json',
    ],
    { cwd: scratch, encoding: 'utf8' },
  );
  assert.equal(suspicious.status, 2);
  assert.equal(JSON.parse(suspicious.stdout).complete, true);
  writeFileSync(
    join(scratch, 'check.mjs'),
    `import {analyze,ingest,parseJson,reportSchema} from 'agent-workflow-inspector';
const report=analyze(ingest(parseJson('{"version":1,"traceId":"smoke","operations":[]}')));
if(!reportSchema.safeParse(report).success||report.findings.length)process.exit(1);`,
  );
  execFileSync(process.execPath, ['check.mjs'], {
    cwd: scratch,
    stdio: 'pipe',
  });
  console.log(
    'Packed installation, CLI exit codes and public ESM library passed.',
  );
} finally {
  if (!scratch.startsWith(join(root, '.awi-smoke-')))
    throw new Error('Unexpected cleanup target');
  rmSync(scratch, { recursive: true, force: true });
}
