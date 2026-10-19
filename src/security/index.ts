export const LIMITS = Object.freeze({
  fileBytes: 16 * 1024 * 1024,
  spans: 50000,
  traces: 50000,
  repetitionWindow: 100,
  aggregateBytes: 64 * 1024 * 1024,
  processedBytes: 64 * 1024 * 1024,
  depth: 64,
  stringLength: 65536,
  nodes: 1000000,
  files: 256,
  findings: 1000,
});
export class AwiError extends Error {}
export function safeText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?');
}
export function validateValue(
  value: unknown,
  allowUndefinedProperties = false,
): void {
  let nodes = 0;
  let bytes = 0;
  function charge(amount: number): void {
    bytes += amount;
    if (bytes > LIMITS.processedBytes)
      throw new AwiError('JSON content exceeds processed size limit');
  }
  // Recursion cannot exceed 65 frames; descriptors are read one at a time, not materialized for an entire wide object.
  function visit(item: unknown, depth: number): void {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth)
      throw new AwiError('JSON structure exceeds resource limits');
    if (typeof item === 'string' && item.length > LIMITS.stringLength)
      throw new AwiError('JSON string exceeds resource limit');
    if (typeof item === 'number' && !Number.isFinite(item))
      throw new AwiError('Non-finite number');
    if (item !== null && typeof item === 'object') {
      charge(2);
      const array = Array.isArray(item);
      const prototype = Object.getPrototypeOf(item);
      if (
        array
          ? prototype !== Array.prototype
          : prototype !== Object.prototype && prototype !== null
      )
        throw new AwiError('Only plain JSON objects and arrays are supported');
      if (array && nodes + item.length > LIMITS.nodes)
        throw new AwiError('JSON structure exceeds resource limits');
      const keys = Reflect.ownKeys(item);
      if (nodes + keys.length - (array ? 1 : 0) > LIMITS.nodes)
        throw new AwiError('JSON structure exceeds resource limits');
      let arrayIndex = 0;
      for (const key of keys) {
        if (typeof key === 'symbol')
          throw new AwiError('Symbol keys are not JSON');
        if (array && key === 'length') continue;
        if (array && key !== String(arrayIndex++))
          throw new AwiError('Sparse or extended arrays are not JSON');
        if (key.length > LIMITS.stringLength)
          throw new AwiError('JSON key exceeds resource limit');
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new AwiError('Unsafe object key');
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (descriptor.get || descriptor.set)
          throw new AwiError('Accessors are not JSON');
        if (!descriptor.enumerable)
          throw new AwiError('Non-enumerable properties are not JSON');
        if (
          descriptor.value === undefined &&
          allowUndefinedProperties &&
          !array
        )
          continue;
        if (!array) charge(Buffer.byteLength(JSON.stringify(key)) + 1);
        charge(1);
        visit(descriptor.value, depth + 1);
      }
      if (array && arrayIndex !== item.length)
        throw new AwiError('Sparse or extended arrays are not JSON');
    } else if (
      !['string', 'number', 'boolean'].includes(typeof item) &&
      item !== null
    )
      throw new AwiError('Unsupported JSON value');
    else charge(Buffer.byteLength(JSON.stringify(item)));
  }
  visit(value, 0);
}
export function parseJson(text: string): unknown {
  if (Buffer.byteLength(text) > LIMITS.fileBytes)
    throw new AwiError('Input exceeds maximum file size');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AwiError('Invalid JSON');
  }
  validateValue(value);
  return value;
}
// Content is opt-in and still redacted by structural key, never a promise of anonymization.
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /authorization|password|secret|token|api.?key|cookie|credential|prompt|message|output|result/i.test(
          k,
        )
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  return typeof value === 'string' ? safeText(value) : value;
}

export function validateIgnorePaths(paths: readonly string[]): void {
  if (
    !Array.isArray(paths) ||
    paths.length > 100 ||
    paths.some(
      (path) =>
        typeof path !== 'string' ||
        path.length > LIMITS.stringLength ||
        !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path) ||
        path.split('.').length > LIMITS.depth ||
        path
          .split('.')
          .some((key) =>
            ['__proto__', 'constructor', 'prototype'].includes(key),
          ),
    )
  )
    throw new AwiError('Invalid fingerprint ignore paths');
}
