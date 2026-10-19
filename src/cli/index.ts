#!/usr/bin/env node
import { constants } from 'node:fs';
import { Command, Option } from 'commander';
import { open, lstat, opendir, realpath, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, parse as parsePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analyze, severityRank } from '../core/analysis.js';
import { ingest } from '../adapters/index.js';
import { parseJson, AwiError, LIMITS, safeText } from '../security/index.js';
import { resolveConfig } from '../config/index.js';
import { humanReport, jsonReport } from '../core/reporting.js';
import type { Trace, Severity } from '../core/models.js';
async function noSymlinkComponents(path: string): Promise<void> {
  const absolute = resolve(path),
    root = parsePath(absolute).root;
  const parts: string[] = [];
  let current = absolute;
  while (current !== root) {
    parts.push(current);
    current = dirname(current);
  }
  for (const part of parts.reverse())
    if ((await lstat(part)).isSymbolicLink())
      throw new AwiError('Symlinks are not supported in paths');
}
async function readJson(
  path: string,
  maxBytes: number = LIMITS.fileBytes,
): Promise<{ value: unknown; bytes: number }> {
  await noSymlinkComponents(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new AwiError('Input must be a regular non-symlink file');
  const limit = Math.min(LIMITS.fileBytes, maxBytes);
  if (stat.size > limit)
    throw new AwiError('Input exceeds maximum allowed file or aggregate size');
  const file = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const after = await file.stat();
    if (
      !after.isFile() ||
      after.dev !== stat.dev ||
      after.ino !== stat.ino ||
      after.size > limit
    )
      throw new AwiError('Invalid or changed input file');
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const result = await file.read(chunk, 0, chunk.length, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
      if (size > limit)
        throw new AwiError(
          'Input exceeds maximum allowed file or aggregate size',
        );
      chunks.push(chunk.subarray(0, result.bytesRead));
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, size),
      );
    } catch {
      throw new AwiError('Input is not valid UTF-8');
    }
    return { value: parseJson(text), bytes: size };
  } finally {
    await file.close();
  }
}
async function collect(paths: string[]): Promise<string[]> {
  const files = new Set<string>();
  let entries = 0;
  async function visit(path: string, depth: number): Promise<void> {
    if (++entries > 2048 || depth > 16)
      throw new AwiError('Directory traversal limit exceeded');
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new AwiError('Symlinks are not supported');
    if (stat.isDirectory()) {
      const directory = await opendir(path);
      const names: string[] = [];
      for await (const entry of directory) {
        if (entries + names.length >= 2048)
          throw new AwiError('Directory traversal limit exceeded');
        names.push(entry.name);
      }
      if (!names.length) throw new AwiError('Empty input directory');
      for (const name of names.sort()) await visit(join(path, name), depth + 1);
    } else {
      if (!stat.isFile() || !path.toLowerCase().endsWith('.json'))
        throw new AwiError('Only regular .json input files are supported');
      files.add(await realpath(path));
      if (files.size > LIMITS.files)
        throw new AwiError('Maximum input file count exceeded');
    }
  }
  for (const path of paths) {
    await noSymlinkComponents(path);
    await visit(resolve(path), 0);
  }
  return [...files].sort();
}
async function writeReport(path: string, body: string): Promise<void> {
  const target = resolve(path),
    temporary = join(dirname(target), '.awi-report-' + randomUUID() + '.tmp');
  await noSymlinkComponents(dirname(target));
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(body, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    // Atomic publication without overwriting any existing file, including inputs/hardlinks.
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
process.stderr.on('error', () => {
  process.exitCode = 1;
});
process.stdout.on('error', () => {
  process.exitCode = 1;
  process.stderr.write('awi: Unable to write report output\n');
});
const program = new Command()
  .configureOutput({
    writeErr: (text) => {
      process.stderr.write(safeText(text) + '\n');
    },
  })
  .name('awi')
  .description('Find loops, retries, and wasted work in AI agent traces.')
  .version('1.0.0');
program
  .command('inspect')
  .argument('<paths...>', 'JSON files or directories (recursive; no symlinks)')
  .addOption(
    new Option('--format <format>').choices(['human', 'json']).default('human'),
  )
  .addOption(
    new Option('--input-format <format>')
      .choices(['auto', 'awi', 'otel'])
      .default('auto'),
  )
  .option('--config <path>', 'Strict JSON configuration')
  .addOption(
    new Option('--fail-on <severity>', 'Finding threshold; default: high')
      .choices(['low', 'medium', 'high', 'none'])
      .default('high'),
  )
  .option(
    '--output <path>',
    'Create a new report file; existing paths are refused',
  )
  .option('--no-color', 'Disable colors (output is plain text)')
  .option(
    '--show-content',
    'Include recorded content with key-based redaction; may expose private data',
  )
  .action(
    async (
      paths: string[],
      options: {
        format: string;
        inputFormat: 'auto' | 'awi' | 'otel';
        config?: string;
        failOn: Severity | 'none';
        output?: string;
        showContent?: boolean;
        color?: boolean;
      },
    ) => {
      const files = await collect(paths);
      const config = resolveConfig(
        options.config ? (await readJson(resolve(options.config))).value : {},
      );
      const traces: Trace[] = [];
      let count = 0;
      let totalBytes = 0;
      for (const path of files) {
        const input = await readJson(path, LIMITS.aggregateBytes - totalBytes);
        totalBytes += input.bytes;
        const imported = ingest(input.value, options.inputFormat);
        count += imported.reduce((n, t) => n + t.operations.length, 0);
        if (count > LIMITS.spans)
          throw new AwiError('Maximum total span count exceeded');
        if (traces.length + imported.length > LIMITS.traces)
          throw new AwiError('Maximum trace count exceeded');
        for (const trace of imported) traces.push(trace);
      }
      if (!traces.length) throw new AwiError('No traces found');
      const report = analyze(traces, config, options.showContent);
      const body =
        options.format === 'json'
          ? jsonReport(report)
          : humanReport(report, {
              color:
                !options.output &&
                process.env.TERM !== 'dumb' &&
                options.color !== false &&
                !!process.stdout.isTTY &&
                !('NO_COLOR' in process.env),
            });
      if (options.output) await writeReport(options.output, body);
      else process.stdout.write(body);
      process.exitCode = !report.complete
        ? 1
        : options.failOn !== 'none' &&
            report.findings.some(
              (f) =>
                severityRank[f.severity] >=
                severityRank[options.failOn as Severity],
            )
          ? 2
          : 0;
    },
  );
program.parseAsync().catch((error: unknown) => {
  const message =
    error instanceof AwiError
      ? error.message
      : 'Filesystem or internal operation failed';
  process.stderr.write('awi: ' + safeText(message) + '\n');
  process.exitCode = 1;
});
