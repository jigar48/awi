import { createHash } from 'node:crypto';
import { validateValue } from '../security/index.js';
import type { Operation } from './models.js';
export function canonicalize(
  value: unknown,
  ignorePaths: string[] = [],
): string {
  validateValue(value);
  const ignores = new Set(
    ignorePaths.map((path) => JSON.stringify(path.split('.'))),
  );
  function encode(v: unknown, path: string[]): string {
    if (Array.isArray(v))
      return (
        '[' + v.map((item) => encode(item, [...path, '\0'])).join(',') + ']'
      );
    if (v && typeof v === 'object')
      return (
        '{' +
        Object.keys(v)
          .sort()
          .filter((k) => !ignores.has(JSON.stringify([...path, k])))
          .map(
            (k) =>
              JSON.stringify(k) +
              ':' +
              encode((v as Record<string, unknown>)[k], [...path, k]),
          )
          .join(',') +
        '}'
      );
    return JSON.stringify(v);
  }
  return encode(value, []);
}
export function hash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
export function fingerprint(op: Operation, ignorePaths: string[] = []): string {
  return hash({
    version: 'awi-sha256-v1',
    type: op.type,
    tool: op.toolName ?? op.name,
    arguments:
      op.arguments === undefined
        ? { present: false }
        : { present: true, value: canonicalize(op.arguments, ignorePaths) },
  });
}
