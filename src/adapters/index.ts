import { z } from 'zod';
import { AwiError, LIMITS, validateValue } from '../security/index.js';
import type { Operation, Trace } from '../core/models.js';
const time = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const operation = z.strictObject({
  id: z.string().min(1),
  parentId: z.string().min(1).optional(),
  type: z.enum(['tool', 'agent', 'model', 'workflow', 'generic']),
  name: z.string().min(1),
  toolName: z.string().optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  status: z.enum(['ok', 'error', 'unknown']).default('unknown'),
  error: z
    .strictObject({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  arguments: z.unknown().optional(),
  resultMetadata: z.record(z.string(), z.unknown()).optional(),
  usage: z
    .strictObject({
      inputTokens: count.optional(),
      outputTokens: count.optional(),
      totalTokens: count.optional(),
    })
    .optional(),
  cost: z
    .strictObject({
      amount: z.number().finite().nonnegative(),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const traceSchema = z.strictObject({
  version: z.literal(1),
  traceId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  operations: z.array(operation).max(LIMITS.spans),
});
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function list(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new AwiError('Invalid OTLP array');
  return v;
}
function string(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function anyValue(v: unknown): unknown {
  const r = record(v);
  if ('stringValue' in r) return r.stringValue;
  if ('boolValue' in r) return r.boolValue;
  if ('intValue' in r) {
    const n = Number(r.intValue);
    return Number.isSafeInteger(n) ? n : String(r.intValue);
  }
  if ('doubleValue' in r) return r.doubleValue;
  if ('bytesValue' in r) return r.bytesValue;
  if ('arrayValue' in r)
    return list(record(r.arrayValue).values ?? []).map(anyValue);
  if ('kvlistValue' in r) return attributes(record(r.kvlistValue).values);
  return null;
}
function attributes(v: unknown): Record<string, unknown> {
  return Object.fromEntries(
    list(v ?? []).map((a) => {
      const r = record(a);
      if (typeof r.key !== 'string')
        throw new AwiError('Invalid OTLP attribute key');
      return [r.key, anyValue(r.value)];
    }),
  );
}
function timestamp(v: unknown): string | undefined {
  if (v === undefined || v === '0' || v === 0) return undefined;
  if (
    (typeof v !== 'string' || !/^\d+$/.test(v)) &&
    (typeof v !== 'number' || !Number.isSafeInteger(v))
  )
    throw new AwiError('Invalid OTLP nanosecond timestamp');
  const ms = Number(BigInt(v as string | number) / 1000000n);
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 8640000000000000)
    throw new AwiError('OTLP timestamp out of range');
  return new Date(ms).toISOString();
}
function otel(value: unknown): Trace[] {
  const grouped = new Map<string, Trace>();
  let total = 0;
  for (const resource of list(record(value).resourceSpans)) {
    const r = record(resource);
    for (const scope of list(r.scopeSpans ?? []))
      for (const raw of list(record(scope).spans ?? [])) {
        if (++total > LIMITS.spans)
          throw new AwiError('Maximum span count exceeded');
        const s = record(raw);
        const traceId = string(s.traceId),
          id = string(s.spanId);
        if (
          !traceId ||
          !/^[a-fA-F0-9]{32}$/.test(traceId) ||
          /^0+$/.test(traceId) ||
          !id ||
          !/^[a-fA-F0-9]{16}$/.test(id) ||
          /^0+$/.test(id)
        )
          throw new AwiError('Invalid OTLP trace/span identity');
        const a = attributes(s.attributes);
        const kind = a['gen_ai.operation.name'];
        const tool = string(a['gen_ai.tool.name']) ?? string(a['tool.name']);
        const type: Operation['type'] =
          tool || kind === 'execute_tool'
            ? 'tool'
            : kind === 'invoke_agent'
              ? 'agent'
              : [
                    'chat',
                    'generate_content',
                    'text_completion',
                    'embeddings',
                  ].includes(String(kind))
                ? 'model'
                : kind === 'workflow'
                  ? 'workflow'
                  : 'generic';
        const status = record(s.status).code;
        const events = list(s.events ?? []).map(record);
        const exception = events.find((e) => e.name === 'exception');
        const ea = exception ? attributes(exception.attributes) : {};
        const usage: NonNullable<Operation['usage']> = {};
        for (const [target, key] of [
          ['inputTokens', 'gen_ai.usage.input_tokens'],
          ['outputTokens', 'gen_ai.usage.output_tokens'],
          ['totalTokens', 'gen_ai.usage.total_tokens'],
        ] as const) {
          const v = a[key];
          if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
            usage[target] = v;
        }
        let args: unknown = a['gen_ai.tool.call.arguments'];
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* Preserve recorded string. */
          }
        }
        const parent = string(s.parentSpanId);
        if (parent && !/^[a-fA-F0-9]{16}$/.test(parent))
          throw new AwiError('Invalid OTLP parent identity');
        const op: Operation = {
          id: id.toLowerCase(),
          type,
          name: string(s.name) ?? 'unnamed',
          status:
            status === 2 || status === 'STATUS_CODE_ERROR'
              ? 'error'
              : status === 1 || status === 'STATUS_CODE_OK'
                ? 'ok'
                : 'unknown',
          ...(parent && !/^0+$/.test(parent)
            ? { parentId: parent.toLowerCase() }
            : {}),
          ...(tool ? { toolName: tool } : {}),
          ...(s.startTimeUnixNano
            ? { startTime: timestamp(s.startTimeUnixNano) }
            : {}),
          ...(s.endTimeUnixNano
            ? { endTime: timestamp(s.endTimeUnixNano) }
            : {}),
          ...(args !== undefined ? { arguments: args } : {}),
          ...(Object.keys(usage).length ? { usage } : {}),
          ...(exception
            ? {
                error: {
                  ...(typeof ea['exception.type'] === 'string'
                    ? { code: ea['exception.type'] }
                    : {}),
                  ...(typeof ea['exception.message'] === 'string'
                    ? { message: ea['exception.message'] }
                    : {}),
                },
              }
            : {}),
          metadata: {
            attributes: a,
            resource: attributes(record(r.resource).attributes),
            scope: record(scope).scope ?? {},
            events: s.events ?? [],
          },
          source: { format: 'otel', index: total - 1 },
        };
        validateValue(op.metadata);
        if (args !== undefined) validateValue(args);
        const key = traceId.toLowerCase();
        if (!grouped.has(key))
          grouped.set(key, { version: 1, traceId: key, operations: [] });
        grouped.get(key)!.operations.push(op);
      }
  }
  return [...grouped.values()];
}
export function ingest(
  value: unknown,
  format: 'auto' | 'awi' | 'otel' = 'auto',
): Trace[] {
  validateValue(value);
  const root = record(value);
  const isOtel = 'resourceSpans' in root;
  const isAwi = 'operations' in root || 'traces' in root;
  if (format === 'auto') {
    if (isOtel === isAwi)
      throw new AwiError('Ambiguous or unsupported trace format');
    format = isOtel ? 'otel' : 'awi';
  }
  if (format === 'otel') return otel(value);
  const collection =
    'traces' in root
      ? z
          .strictObject({ version: z.literal(1), traces: z.array(traceSchema) })
          .safeParse(value)
      : null;
  if (collection) {
    if (!collection.success) throw new AwiError('Invalid AWI trace collection');
    return collection.data.traces.map((t) => ({
      ...t,
      operations: t.operations.map((op, index) => ({
        ...op,
        source: { format: 'awi', index },
      })),
    }));
  }
  const parsed = traceSchema.safeParse(value);
  if (!parsed.success)
    throw new AwiError(
      'Invalid AWI trace schema: ' +
        parsed.error.issues
          .map((i) => i.path.join('.') + ': ' + i.code)
          .join('; '),
    );
  return [
    {
      ...parsed.data,
      operations: parsed.data.operations.map((op, index) => ({
        ...op,
        source: { format: 'awi', index },
      })),
    },
  ];
}
