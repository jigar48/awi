import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const root = realpathSync(resolve('.'));
const scratch = realpathSync(
  mkdtempSync(join(realpathSync(tmpdir()), 'awi-package-smoke-')),
);
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run with pnpm smoke:package');
function run(args, cwd = root) {
  return execFileSync(process.execPath, [pnpm, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024,
  });
}
try {
  const archive = join(scratch, 'awi.tgz');
  run(['pack', '--out', archive]);
  const tar = gunzipSync(readFileSync(archive));
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, end) =>
      header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const name = (text(345, 500) ? text(345, 500) + '/' : '') + text(0, 100);
    const size = parseInt(text(124, 136).trim() || '0', 8);
    assert.ok(Number.isFinite(size));
    entries.push({ name, mode: parseInt(text(100, 108).trim() || '0', 8) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const executable = entries.find(
    (entry) => entry.name === 'package/dist/cli/index.js',
  );
  assert.ok(executable);
  assert.ok(executable.mode & 0o111, 'Tarball CLI must be executable');
  const allowedTopLevel = new Set([
    'package.json',
    'README.md',
    'LICENSE',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'CODE_OF_CONDUCT.md',
    'awi.config.example.json',
  ]);
  for (const entry of entries) {
    const relative = entry.name.slice('package/'.length);
    assert.ok(
      !relative ||
        allowedTopLevel.has(relative) ||
        ['dist/', 'docs/', 'examples/'].some((prefix) =>
          relative.startsWith(prefix),
        ),
      'Unexpected packed file: ' + entry.name,
    );
    assert.ok(entry.name.startsWith('package/'));
    assert.ok(!entry.name.split('/').includes('..'));
    assert.ok(!/node_modules|\.awi-|\.git\//.test(entry.name));
  }
  for (const name of [
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'CODE_OF_CONDUCT.md',
  ])
    assert.ok(entries.some((entry) => entry.name === 'package/' + name));
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'awi-smoke', private: true, type: 'module' }),
  );
  run(['--ignore-workspace', 'add', archive, '--ignore-scripts'], scratch);
  const installed = realpathSync(
    join(scratch, 'node_modules', 'agent-workflow-inspector'),
  );
  const manifest = JSON.parse(
    readFileSync(join(installed, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.bin.awi, 'dist/cli/index.js');
  assert.equal(manifest.exports['.'].import, './dist/index.js');
  assert.equal(manifest.exports['.'].types, './dist/index.d.ts');
  assert.ok(
    readFileSync(join(installed, manifest.bin.awi), 'utf8').startsWith(
      '#!/usr/bin/env node\n',
    ),
  );
  assert.equal(
    run(['exec', 'awi', '--version'], scratch).trim(),
    manifest.version,
  );
  assert.match(
    run(['exec', 'awi', 'inspect', '--help'], scratch),
    /--show-content/,
  );
  const example = (path) => join(installed, 'examples', path);
  const healthy = JSON.parse(
    run(
      [
        'exec',
        'awi',
        'inspect',
        example('healthy/basic.json'),
        '--format',
        'json',
        '--input-format',
        'awi',
      ],
      scratch,
    ),
  );
  assert.equal(healthy.findings.length, 0);
  for (const [path, format, rule, exit] of [
    ['suspicious/retries.json', 'awi', 'AWI002', 2],
    ['suspicious/cycle.json', 'auto', 'AWI003', 0],
    ['opentelemetry/tools.json', 'otel', 'AWI004', 2],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        pnpm,
        'exec',
        'awi',
        'inspect',
        example(path),
        '--input-format',
        format,
        '--format',
        'json',
      ],
      { cwd: scratch, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(result.status, exit);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.complete, true);
    assert.ok(report.findings.some((f) => f.ruleId === rule));
  }
  const output = join(scratch, 'x'.repeat(230) + '.json');
  run(
    [
      'exec',
      'awi',
      'inspect',
      example('healthy/basic.json'),
      '--config',
      join(installed, 'awi.config.example.json'),
      '--output',
      output,
      '--format',
      'json',
      '--no-color',
      '--show-content',
      '--fail-on',
      'none',
    ],
    scratch,
  );
  assert.ok(JSON.parse(readFileSync(output, 'utf8')).content);
  assert.match(
    run(
      [
        'exec',
        'awi',
        'inspect',
        join(installed, 'examples', 'suspicious'),
        '--fail-on',
        'none',
        '--no-color',
      ],
      scratch,
    ),
    /analysis complete/,
  );
  writeFileSync(
    join(scratch, 'check.mjs'),
    `import {analyze,ingest,parseJson,reportSchema,traceSchema,configSchema,resolveConfig,fingerprint,canonicalize,humanReport,jsonReport,LIMITS,AwiError} from 'agent-workflow-inspector';
const report=analyze(ingest(parseJson('{"version":1,"traceId":"smoke","operations":[]}')));
if(!reportSchema.safeParse(report).success||report.findings.length||!traceSchema||!configSchema||!resolveConfig||!fingerprint||!canonicalize||!humanReport||!jsonReport||!LIMITS||!AwiError)process.exit(1);`,
  );
  execFileSync(process.execPath, ['check.mjs'], {
    cwd: scratch,
    stdio: 'pipe',
  });
  writeFileSync(
    join(scratch, 'consumer.mts'),
    `import {analyze, type Trace, type Report, type Config, resolveConfig} from 'agent-workflow-inspector';
const traces:Trace[]=[];const config:Config=resolveConfig();const report:Report=analyze(traces,config);console.log(report.complete);`,
  );
  writeFileSync(
    join(scratch, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        types: [],
      },
      files: ['consumer.mts'],
    }),
  );
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--project',
      join(scratch, 'tsconfig.json'),
    ],
    { cwd: scratch, stdio: 'pipe' },
  );
  assert.deepEqual(readdirSync(join(installed, 'dist')).sort(), [
    'cli',
    'index.d.ts',
    'index.js',
    'index.js.map',
  ]);
  console.log(
    'Packed tarball allowlist/executable, isolated install, all examples/options, ESM API and strict consumer TypeScript passed.',
  );
} finally {
  if (
    dirname(scratch) !== realpathSync(tmpdir()) ||
    !basename(scratch).startsWith('awi-package-smoke-')
  )
    throw new Error('Unexpected cleanup target');
  rmSync(scratch, { recursive: true, force: true });
}
