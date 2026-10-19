import { createHash } from 'node:crypto';
import {
  validateValue,
  validateIgnorePaths,
  AwiError,
} from '../security/index.js';
import type { Operation } from './models.js';
interface IgnoreNode {
  ignored: boolean;
  children: Map<string, IgnoreNode>;
}
const ignoredPathCache = new WeakMap<
  readonly string[],
  { snapshot: string[]; root: IgnoreNode | undefined }
>();
function compileIgnorePaths(paths: readonly string[]): IgnoreNode | undefined {
  if (
    !Array.isArray(paths) ||
    Object.getPrototypeOf(paths) !== Array.prototype ||
    paths.length > 100
  )
    throw new AwiError('Invalid fingerprint ignore paths');
  const values: string[] = [];
  if (Reflect.ownKeys(paths).length !== paths.length + 1)
    throw new AwiError('Invalid fingerprint ignore paths');
  for (let index = 0; index < paths.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(paths, String(index));
    if (
      !descriptor ||
      descriptor.get ||
      descriptor.set ||
      typeof descriptor.value !== 'string'
    )
      throw new AwiError('Invalid fingerprint ignore paths');
    values.push(descriptor.value);
  }
  const cached = ignoredPathCache.get(paths);
  if (
    cached &&
    cached.snapshot.length === values.length &&
    values.every((value, index) => value === cached.snapshot[index])
  )
    return cached.root;
  validateIgnorePaths(values);
  const root: IgnoreNode | undefined = values.length
    ? { ignored: false, children: new Map() }
    : undefined;
  for (const path of values) {
    let node = root!;
    for (const part of path.split('.')) {
      let child = node.children.get(part);
      if (!child) {
        child = { ignored: false, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.ignored = true;
  }
  ignoredPathCache.set(paths, { snapshot: values, root });
  return root;
}
export function canonicalize(
  value: unknown,
  ignorePaths: string[] = [],
): string {
  validateValue(value);
  const root = compileIgnorePaths(ignorePaths);
  function encode(v: unknown, node: IgnoreNode | undefined): string {
    if (Array.isArray(v))
      return '[' + v.map((item) => encode(item, undefined)).join(',') + ']';
    if (v && typeof v === 'object')
      return (
        '{' +
        Object.keys(v)
          .sort()
          .filter((key) => !node?.children.get(key)?.ignored)
          .map(
            (key) =>
              JSON.stringify(key) +
              ':' +
              encode(
                (v as Record<string, unknown>)[key],
                node?.children.get(key),
              ),
          )
          .join(',') +
        '}'
      );
    return JSON.stringify(v);
  }
  return encode(value, root);
}
export function hash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
export function fingerprint(op: Operation, ignorePaths: string[] = []): string {
  validateValue(op, true);
  compileIgnorePaths(ignorePaths);
  const tool = op.toolName ?? op.name;
  if (
    typeof tool !== 'string' ||
    !['tool', 'agent', 'model', 'workflow', 'generic'].includes(op.type)
  )
    throw new AwiError('Invalid operation fingerprint identity');
  // Preserve the exact v1 byte contract without treating generated canonical JSON as an input string field.
  const digest = createHash('sha256').update('{"arguments":');
  if (op.arguments === undefined) digest.update('{"present":false}');
  else
    digest
      .update('{"present":true,"value":')
      .update(JSON.stringify(canonicalize(op.arguments, ignorePaths)))
      .update('}');
  return digest
    .update(',"tool":')
    .update(JSON.stringify(tool))
    .update(',"type":')
    .update(JSON.stringify(op.type))
    .update(',"version":"awi-sha256-v1"}')
    .digest('hex');
}
