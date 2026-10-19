import { AwiError } from '../security/index.js';
/** Preserve up to nine fractional digits; Date.parse alone would erase concurrency evidence. */
export function timeNanoseconds(value: string): bigint {
  const milliseconds = Date.parse(value);
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
  if (!Number.isFinite(milliseconds) || fraction.length > 9)
    throw new AwiError('Invalid or unsupported timestamp precision');
  return (
    BigInt(milliseconds) * 1000000n +
    BigInt(fraction.padEnd(9, '0').slice(3) || '0')
  );
}
export function validTime(value: string): boolean {
  try {
    timeNanoseconds(value);
    return true;
  } catch {
    return false;
  }
}
