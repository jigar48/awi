import { z } from 'zod';
import { AwiError, LIMITS, validateValue } from '../security/index.js';
const positive = z.number().int().min(1);
const repeat = (threshold: number) =>
  z.strictObject({
    enabled: z.boolean().default(true),
    threshold: positive.min(2).max(LIMITS.repetitionWindow).default(threshold),
  });
export const configSchema = z.strictObject({
  version: z.literal(1).default(1),
  rules: z
    .strictObject({
      AWI001: repeat(4).default({ enabled: true, threshold: 4 }),
      AWI002: repeat(3).default({ enabled: true, threshold: 3 }),
      AWI003: z
        .strictObject({
          enabled: z.boolean().default(true),
          minRepetitions: positive.min(2).max(100).default(3),
          maxCycleLength: positive.min(2).max(16).default(6),
        })
        .default({ enabled: true, minRepetitions: 3, maxCycleLength: 6 }),
      AWI004: z
        .strictObject({
          enabled: z.boolean().default(true),
          threshold: positive.min(2).max(LIMITS.repetitionWindow).default(5),
          windowSeconds: positive.max(3600).default(30),
        })
        .default({ enabled: true, threshold: 5, windowSeconds: 30 }),
      AWI005: z
        .strictObject({
          enabled: z.boolean().default(true),
          maxOperations: positive.max(50000).default(100),
          maxDepth: positive.max(1000).default(20),
        })
        .default({ enabled: true, maxOperations: 100, maxDepth: 20 }),
      AWI006: z
        .strictObject({ enabled: z.boolean().default(true) })
        .default({ enabled: true }),
    })
    .default({
      AWI001: { enabled: true, threshold: 4 },
      AWI002: { enabled: true, threshold: 3 },
      AWI003: { enabled: true, minRepetitions: 3, maxCycleLength: 6 },
      AWI004: { enabled: true, threshold: 5, windowSeconds: 30 },
      AWI005: { enabled: true, maxOperations: 100, maxDepth: 20 },
      AWI006: { enabled: true },
    }),
  fingerprint: z
    .strictObject({
      ignorePaths: z
        .array(
          z
            .string()
            .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/)
            .refine(
              (p) =>
                p.split('.').length <= LIMITS.depth &&
                !p
                  .split('.')
                  .some((k) =>
                    ['__proto__', 'constructor', 'prototype'].includes(k),
                  ),
            ),
        )
        .max(100)
        .default([]),
    })
    .default({ ignorePaths: [] }),
});
export type Config = z.infer<typeof configSchema>;
export function resolveConfig(value: unknown = {}): Config {
  validateValue(value);
  const parsed = configSchema.safeParse(value);
  if (!parsed.success)
    throw new AwiError(
      'Invalid configuration: ' +
        parsed.error.issues
          .map((i) => i.path.join('.') + ': ' + i.code)
          .join('; '),
    );
  return parsed.data;
}
