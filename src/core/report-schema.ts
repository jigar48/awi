import { z } from 'zod';
const usage = z.strictObject({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  totalTokens: z.number().nonnegative().optional(),
});
export const reportSchema = z.strictObject({
  version: z.literal(1),
  fingerprintVersion: z.literal('awi-sha256-v1'),
  complete: z.boolean(),
  summaries: z.array(
    z.strictObject({
      traceId: z.string(),
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
      ]),
      severity: z.enum(['low', 'medium', 'high']),
      confidence: z.enum(['high', 'moderate']),
      title: z.string(),
      description: z.string(),
      explanation: z.string(),
      remediation: z.string(),
      traceId: z.string(),
      operationIds: z.array(z.string()),
      evidence: z.record(z.string(), z.unknown()),
    }),
  ),
  warnings: z.array(z.string()),
  content: z
    .array(
      z.strictObject({
        traceId: z.string(),
        operations: z.array(z.unknown()),
      }),
    )
    .optional(),
});
