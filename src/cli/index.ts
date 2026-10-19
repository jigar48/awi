#!/usr/bin/env node
import { Command, Option } from 'commander';
import { open, lstat, opendir, realpath, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analyze, severityRank } from '../core/analysis.js';
import { ingest } from '../adapters/index.js';
import { parseJson, AwiError, LIMITS, safeText } from '../security/index.js';
import { resolveConfig } from '../config/index.js';
import { humanReport, jsonReport } from '../core/reporting.js';
import type { Trace, Severity } from '../core/models.js';
async function readJson(path: string): Promise<unknown> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new AwiError('Input must be a regular non-symlink file');
  if (stat.size > LIMITS.fileBytes)
    throw new AwiError('Input exceeds maximum file size');
  const file = await open(path, 'r');
  try {
    const after = await file.stat();
    if (!after.isFile() || after.size > LIMITS.fileBytes)
      throw new AwiError('Invalid input file');
    const buffer = Buffer.alloc(LIMITS.fileBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await file.read(buffer, size, buffer.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > LIMITS.fileBytes)
      throw new AwiError('Input exceeds maximum file size');
    return parseJson(buffer.subarray(0, size).toString('utf8'));
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
      let found = false;
      for await (const entry of directory) {
        found = true;
        await visit(join(path, entry.name), depth + 1);
      }
      if (!found) throw new AwiError('Empty input directory');
    } else {
      if (!stat.isFile() || !path.toLowerCase().endsWith('.json'))
        throw new AwiError('Only regular .json input files are supported');
      files.add(await realpath(path));
      if (files.size > LIMITS.files)
        throw new AwiError('Maximum input file count exceeded');
    }
  }
  for (const path of paths) await visit(resolve(path), 0);
  return [...files].sort();
}
async function writeReport(path: string, body: string): Promise<void> {
  const target = resolve(path),
    temporary = join(
      dirname(target),
      '.' + basename(target) + '.' + randomUUID() + '.tmp',
    );
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
        options.config ? await readJson(resolve(options.config)) : {},
      );
      const traces: Trace[] = [];
      let count = 0;
      let totalBytes = 0;
      for (const path of files) {
        totalBytes += (await lstat(path)).size;
        if (totalBytes > 64 * 1024 * 1024)
          throw new AwiError('Maximum aggregate input size exceeded');
        const imported = ingest(await readJson(path), options.inputFormat);
        count += imported.reduce((n, t) => n + t.operations.length, 0);
        if (count > LIMITS.spans)
          throw new AwiError('Maximum total span count exceeded');
        traces.push(...imported);
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
