import { it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  linkSync,
  symlinkSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const folder = mkdtempSync(join(tmpdir(), 'awi-test-'));
const cli = resolve('dist/cli/index.js');
const run = (args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
beforeAll(() => {
  execFileSync(process.execPath, ['node_modules/tsup/dist/cli-default.js'], {
    stdio: 'pipe',
  });
});
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
});
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
