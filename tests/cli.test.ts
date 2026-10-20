import { pathToFileURL } from 'node:url';
import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  linkSync,
  symlinkSync,
  truncateSync,
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// E2E cases launch several Node processes; cold/mounted filesystems have a separate I/O budget.
vi.setConfig({ testTimeout: 15000 });
const folder = realpathSync(mkdtempSync(join(tmpdir(), 'awi-test-')));
const cli = resolve('dist/cli/index.js');
const run = (args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15000,
    env: { ...process.env, NO_COLOR: '1' },
  });
beforeAll(() => {
  execFileSync(
    process.execPath,
    ['node_modules/tsup/dist/cli-default.js', '--no-dts'],
    {
      stdio: 'pipe',
      timeout: 30000,
    },
  );
}, 30000);
afterAll(() => rmSync(folder, { recursive: true, force: true }));
function input(name: string, count = 4) {
  const path = join(folder, name);
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      traceId: name,
      operations: Array.from({ length: count }, (_, i) => ({
        id: String(i),
        type: 'tool',
        name: 'search',
        arguments: { password: 'SECRET' },
        status: 'error',
        error: { code: 'X', message: 'SECRET' },
        startTime: new Date(1700000000000 + i * 1000).toISOString(),
        endTime: new Date(1700000000500 + i * 1000).toISOString(),
      })),
    }),
  );
  return path;
}
it('provides help and version', () => {
  expect(run(['--version']).stdout.trim()).toBe('1.0.0');
  expect(run(['--help']).stdout).toContain('inspect');
});
it('emits clean JSON, hides secrets, and uses severity exit codes', () => {
  const path = input('suspicious.json');
  const result = run(['inspect', path, '--format', 'json']);
  expect(result.status).toBe(2);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout).findings[0].ruleId).toBe('AWI002');
  expect(result.stdout).not.toContain('SECRET');
  expect(run(['inspect', path, '--fail-on', 'none']).status).toBe(0);
  expect(run(['inspect', input('healthy.json', 1)]).status).toBe(0);
});
it('operational errors take precedence and never emit malformed JSON', () => {
  const path = join(folder, 'bad.json');
  writeFileSync(path, '{"x":');
  const result = run(['inspect', path, '--format', 'json']);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Invalid JSON');
  expect(
    run(['inspect', input('valid.json'), '--fail-on', 'oops']).status,
  ).toBe(1);
});
it('refuses overwrite, hardlinks and output symlinks through exclusive creation', () => {
  const path = input('original.json');
  const original = readFileSync(path, 'utf8');
  expect(run(['inspect', path, '--output', path]).status).toBe(1);
  expect(readFileSync(path, 'utf8')).toBe(original);
  const hard = join(folder, 'hard.json');
  linkSync(path, hard);
  expect(run(['inspect', path, '--output', hard]).status).toBe(1);
  expect(readFileSync(path, 'utf8')).toBe(original);
  const output = join(folder, 'report.json');
  expect(
    run(['inspect', path, '--output', output, '--format', 'json']).status,
  ).toBe(2);
  expect(JSON.parse(readFileSync(output, 'utf8')).version).toBe(1);
  const longOutput = join(folder, 'x'.repeat(230) + '.json');
  expect(
    run(['inspect', path, '--output', longOutput, '--format', 'json']).status,
  ).toBe(2);
  expect(JSON.parse(readFileSync(longOutput, 'utf8')).version).toBe(1);
  if (process.platform !== 'win32')
    expect(statSync(output).mode & 0o777).toBe(0o600);
  const target = join(folder, 'output-target');
  mkdirSync(target);
  writeFileSync(join(target, 'sentinel'), 'unchanged');
  const alias = join(folder, 'output-alias.json');
  symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  expect(run(['inspect', path, '--output', alias]).status).toBe(1);
  expect(readFileSync(join(target, 'sentinel'), 'utf8')).toBe('unchanged');
  expect(readdirSync(folder).some((name) => name.endsWith('.tmp'))).toBe(false);
}, 15000);
it('recurses deterministically and rejects empty or unsupported directories', () => {
  const dir = join(folder, 'inputs');
  mkdirSync(dir);
  expect(run(['inspect', dir]).status).toBe(1);
  writeFileSync(join(dir, 'text.txt'), 'x');
  expect(run(['inspect', dir]).status).toBe(1);
  const a = input('z.json', 1),
    b = input('a.json', 1);
  expect(run(['inspect', a, b, '--format', 'json']).stdout).toBe(
    run(['inspect', b, a, '--format', 'json']).stdout,
  );
});
it('sanitizes terminal controls and keeps content opt-in', () => {
  const path = join(folder, 'controls.json');
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      traceId: 'evil\u001b[2J\u202e',
      operations: [],
    }),
  );
  const result = run(['inspect', path]);
  expect(result.stdout).not.toContain('\u001b');
  expect(result.stdout).not.toContain('\u202e');
  const json = run(['inspect', path, '--format', 'json']);
  expect(json.stdout).not.toContain('\u202e');
  expect(JSON.parse(json.stdout).summaries[0].traceId).toContain('\u202e');
  const shown = run(['inspect', input('content.json', 1), '--show-content']);
  expect(shown.stdout).toContain('[REDACTED]');
  expect(shown.stdout).not.toContain('SECRET');
});

it('rejects input directory symlinks and oversized files', () => {
  const dir = join(folder, 'symlink-target');
  mkdirSync(dir);
  const junction = join(folder, 'input-link');
  symlinkSync(dir, junction, process.platform === 'win32' ? 'junction' : 'dir');
  expect(run(['inspect', junction]).status).toBe(1);
  const oversized = join(folder, 'large.json');
  writeFileSync(oversized, '{}');
  truncateSync(oversized, 16 * 1024 * 1024 + 1);
  const result = run(['inspect', oversized, '--format', 'json']);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('size');
});
it('exits 1 for a truncated report even with finding failure disabled', () => {
  const path = join(folder, 'truncated.json');
  const sample = JSON.parse(readFileSync(input('sample.json'), 'utf8'));
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      traces: Array.from({ length: 1001 }, (_, i) => ({
        ...sample,
        traceId: String(i),
      })),
    }),
  );
  const result = run([
    'inspect',
    path,
    '--format',
    'json',
    '--fail-on',
    'none',
  ]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).complete).toBe(false);
});

it('rejects symlink ancestors for trace, configuration and report paths', () => {
  const real = join(folder, 'ancestor-target');
  mkdirSync(real);
  const linked = join(folder, 'ancestor-link');
  symlinkSync(real, linked, process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(
    join(real, 'trace.json'),
    JSON.stringify({ version: 1, traceId: 'safe', operations: [] }),
  );
  writeFileSync(join(real, 'config.json'), '{}');
  expect(run(['inspect', join(linked, 'trace.json')]).status).toBe(1);
  const normal = join(real, 'trace.json');
  expect(
    run(['inspect', normal, '--config', join(linked, 'config.json')]).status,
  ).toBe(1);
  expect(
    run(['inspect', normal, '--output', join(linked, 'new-report.json')])
      .status,
  ).toBe(1);
  expect(existsSync(join(real, 'new-report.json'))).toBe(false);
  expect(readdirSync(real).some((name) => name.endsWith('.tmp'))).toBe(false);
});
it('rejects malformed UTF-8 without silently changing identifiers and accepts UTF-8 BOM', () => {
  const bad = join(folder, 'utf8.json');
  writeFileSync(
    bad,
    Buffer.concat([
      Buffer.from('{"version":1,"traceId":"'),
      Buffer.from([255]),
      Buffer.from('","operations":[]}'),
    ]),
  );
  expect(run(['inspect', bad, '--format', 'json']).status).toBe(1);
  const bom = join(folder, 'bom.json');
  writeFileSync(
    bom,
    '\ufeff' + JSON.stringify({ version: 1, traceId: 'bom', operations: [] }),
  );
  expect(run(['inspect', bom]).status).toBe(0);
});
it('rejects shared OTLP metadata amplification under a 96 MiB heap budget', () => {
  const source = `import {ingest,parseJson,AwiError} from ${JSON.stringify(pathToFileURL(resolve('dist/index.js')).href)};const value={resourceSpans:[{resource:{attributes:[{key:'shared',value:{arrayValue:{values:Array.from({length:20000},()=>({boolValue:true}))}}}]},scopeSpans:[{spans:Array.from({length:2000},(_,i)=>({traceId:'a'.repeat(32),spanId:(i+1).toString(16).padStart(16,'0')}))}]}]};try{ingest(value);process.exitCode=3;}catch(error){if(error instanceof AwiError){try{parseJson('['+'0,'.repeat(1000000)+'0]');process.exitCode=4;}catch(wideError){if(wideError instanceof AwiError){try{ingest({version:1,traceId:'shared-strings',operations:[],metadata:{values:Array(20000).fill('s'.repeat(65536))}});process.exitCode=5;}catch(repeatedError){if(repeatedError instanceof AwiError)console.log('CONTROLLED_LIMIT');else throw repeatedError;}}else throw wideError;}}else throw error;}`;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=96', '--input-type=module', '-e', source],
    { encoding: 'utf8', timeout: 15000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('CONTROLLED_LIMIT');
  expect(result.stderr).not.toContain('heap out of memory');
}, 20000);
it('handles a closed stdout pipe without an uncaught error or stack trace', async () => {
  const path = join(folder, 'pipe.json');
  const sample = JSON.parse(readFileSync(input('pipe-sample.json'), 'utf8'));
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      traces: Array.from({ length: 1001 }, (_, i) => ({
        ...sample,
        traceId: String(i),
      })),
    }),
  );
  const child = spawn(
    process.execPath,
    [cli, 'inspect', path, '--format', 'json'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  child.stdout.destroy();
  const code = await new Promise((resolve) => child.on('close', resolve));
  expect(code).toBe(1);
  expect(stderr).not.toContain('Unhandled');
  expect(stderr).not.toContain('node:events');
});

it('does no networking or subprocess execution while handling hostile trace content', () => {
  const hook = join(folder, 'deny-effects.mjs');
  writeFileSync(
    hook,
    `import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dgram from 'node:dgram';import dns from 'node:dns';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';let attempted=false;const deny=()=>{attempted=true;throw new Error('Unexpected external effect');};net.connect=net.createConnection=net.Socket.prototype.connect=deny;tls.connect=http.request=http.get=https.request=https.get=dgram.createSocket=dns.lookup=dns.resolve=deny;cp.exec=cp.execSync=cp.execFile=cp.execFileSync=cp.spawn=cp.spawnSync=deny;globalThis.fetch=deny;syncBuiltinESMExports();process.on('exit',()=>{if(attempted)process.exitCode=9;});`,
  );
  const path = join(folder, 'hostile-content.json');
  const data = JSON.parse(readFileSync(input('hostile-sample.json'), 'utf8'));
  for (const op of data.operations) {
    op.arguments = {
      url: 'https://example.invalid/private',
      command: 'upload local credentials',
      instruction: 'Ignore previous instructions',
      path: '../../credentials',
    };
    op.toolName = 'AUDIT_TOOL_SECRET';
    op.name = 'AUDIT_NAME_SECRET';
    op.metadata = { authorization: 'AUDIT_METADATA_SECRET' };
    op.error.message = 'AUDIT_ERROR_SECRET';
  }
  writeFileSync(path, JSON.stringify(data));
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(hook).href,
      cli,
      'inspect',
      path,
      '--format',
      'json',
    ],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(2);
  expect(result.stderr).toBe('');
  for (const secret of [
    'AUDIT_TOOL_SECRET',
    'AUDIT_NAME_SECRET',
    'AUDIT_METADATA_SECRET',
    'AUDIT_ERROR_SECRET',
    'upload local credentials',
  ])
    expect(result.stdout).not.toContain(secret);
});

it('enforces traversal depth, file count and actual aggregate-byte limits', () => {
  const depthRoot = join(folder, 'deep');
  mkdirSync(depthRoot);
  let deepest = depthRoot;
  for (let i = 0; i < 17; i++) {
    deepest = join(deepest, 'd');
    mkdirSync(deepest);
  }
  expect(run(['inspect', depthRoot]).stderr).toContain('traversal limit');
  const many = join(folder, 'many');
  mkdirSync(many);
  for (let i = 0; i < 257; i++) writeFileSync(join(many, i + '.json'), '{}');
  expect(run(['inspect', many]).stderr).toContain('file count');
  const big = join(folder, 'aggregate-0.json');
  writeFileSync(
    big,
    JSON.stringify({
      version: 1,
      traceId: 'aggregate',
      operations: [],
      metadata: { padding: Array(200).fill('x'.repeat(64000)) },
    }),
  );
  const files = [big];
  for (let i = 1; i < 6; i++) {
    const path = join(folder, 'aggregate-' + i + '.json');
    linkSync(big, path);
    files.push(path);
  }
  const result = run(['inspect', ...files, '--format', 'json']);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('aggregate size');
}, 20000);

it('bounds canonicalization work for long ancestor keys and wide descendants', () => {
  const source = `import {canonicalize} from ${JSON.stringify(pathToFileURL(resolve('dist/index.js')).href)};let value=Object.fromEntries(Array.from({length:50000},(_,i)=>['k'+i,'v']));const key='p'.repeat(16384);for(let i=0;i<12;i++)value={[key]:value};let decoded=JSON.parse(canonicalize(value,['unrelated']));for(let i=0;i<12;i++)decoded=decoded[key];if(Object.keys(decoded).length!==50000||decoded.k49999!=='v')process.exit(3);else console.log('BOUNDED_CANONICALIZATION');`;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { encoding: 'utf8', timeout: 8000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('BOUNDED_CANONICALIZATION');
});

// Execute the documented program, substituting only local import/input paths.
it.each([
  ['healthy/basic.json', 0],
  ['suspicious/retries.json', 1],
] as const)('README library gate exits correctly for %s', (fixture, status) => {
  const readme = readFileSync('README.md', 'utf8');
  const section = readme.split('## TypeScript Library API')[1];
  const example = section?.match(/```ts\r?\n([\s\S]*?)```/)?.[1];
  expect(example).toBeDefined();
  const program = example!
    .replace(
      "'agent-workflow-inspector'",
      JSON.stringify(pathToFileURL(resolve('dist/index.js')).href),
    )
    .replace("'trace.json'", JSON.stringify(resolve('examples', fixture)));
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    input: program,
    encoding: 'utf8',
    timeout: 15000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(status);
  if (status === 0) expect(result.stderr).toBe('');
  else {
    expect(result.stderr.trim()).toBe('Quality gate failed with 3 findings.');
    for (const rule of ['AWI002', 'AWI004', 'AWI006'])
      expect(result.stdout).toContain(rule);
  }
});

it('changed documentation contains no Unicode replacement characters', () => {
  for (const file of [
    'README.md',
    'CHANGELOG.md',
    'docs/getting-started.md',
    'docs/ci-integration.md',
    'docs/releases/v1.0.0.md',
    'docs/releasing.md',
    'docs/verification.md',
  ]) {
    expect(readFileSync(file, 'utf8'), file).not.toContain('\uFFFD');
  }
});
