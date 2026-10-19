export const LIMITS = Object.freeze({
  fileBytes: 16 * 1024 * 1024,
  spans: 50000,
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
export function validateValue(value: unknown): void {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > LIMITS.nodes || item.depth > LIMITS.depth)
      throw new AwiError('JSON structure exceeds resource limits');
    if (
      typeof item.value === 'string' &&
      item.value.length > LIMITS.stringLength
    )
      throw new AwiError('JSON string exceeds resource limit');
    if (typeof item.value === 'number' && !Number.isFinite(item.value))
      throw new AwiError('Non-finite number');
    if (item.value && typeof item.value === 'object') {
      if (
        !Array.isArray(item.value) &&
        Object.getPrototypeOf(item.value) !== Object.prototype &&
        Object.getPrototypeOf(item.value) !== null
      )
        throw new AwiError('Only plain JSON objects are supported');
      if (Object.getOwnPropertySymbols(item.value).length)
        throw new AwiError('Symbol keys are not JSON');
      if (
        Array.isArray(item.value) &&
        (Object.keys(item.value).length !== item.value.length ||
          Object.keys(item.value).some((key, index) => key !== String(index)))
      )
        throw new AwiError('Sparse or extended arrays are not JSON');
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(item.value),
      ))
        if (descriptor.get || descriptor.set)
          throw new AwiError('Accessors are not JSON');
      for (const [key, v] of Object.entries(item.value)) {
        if (key.length > LIMITS.stringLength)
          throw new AwiError('JSON key exceeds resource limit');
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new AwiError('Unsafe object key');
        stack.push({ value: v, depth: item.depth + 1 });
      }
    } else if (
      !['string', 'number', 'boolean'].includes(typeof item.value) &&
      item.value !== null
    )
      throw new AwiError('Unsupported JSON value');
  }
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
