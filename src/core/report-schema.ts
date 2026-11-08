import { z } from 'zod';
const usage = z.strictObject({
  inputTokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  outputTokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  totalTokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});
const traceId = z.string().regex(/^trace-[1-9][0-9]*$/);
const operationId = z.string().regex(/^op-[1-9][0-9]*$/);
export const reportSchema = z.strictObject({
  version: z.literal(2),
  fingerprintVersion: z.literal('awi-sha256-v1'),
  complete: z.boolean(),
  summaries: z.array(
    z.strictObject({
      traceId,
      operations: z.number().int().nonnegative(),
      toolCalls: z.number().int().nonnegative(),
      maxDepth: z.number().int().nonnegative(),
      durationMs: z.number().nonnegative().optional(),
      usage: usage.optional(),
    }),
  ),
  findings: z.array(
    z.strictObject({
      ruleId: z.enum([
        'AWI001',
        'AWI002',
        'AWI003',
        'AWI004',
        'AWI005',
        'AWI006',
        'AWI007',
      ]),
      severity: z.enum(['low', 'medium', 'high']),
      confidence: z.enum(['high', 'moderate']),
      title: z.string(),
      description: z.string(),
      explanation: z.string(),
      remediation: z.string(),
      traceId,
      operationIds: z.array(operationId),
      evidence: z.looseObject({
        references: z.array(
          z.strictObject({
            operationId,
            source: z
              .strictObject({
                format: z.enum(['awi', 'otel']),
                index: z
                  .number()
                  .int()
                  .nonnegative()
                  .max(Number.MAX_SAFE_INTEGER),
              })
              .optional(),
          }),
        ),
      }),
    }),
  ),
  warnings: z.array(z.string()),
  content: z
    .array(
      z.strictObject({
        traceId,
        recordedTraceId: z.string(),
        operations: z.array(z.unknown()),
      }),
    )
    .optional(),
});
