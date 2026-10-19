import { validTime } from '../core/timestamps.js';
import { z } from 'zod';
import { AwiError, LIMITS, validateValue } from '../security/index.js';
import type { Operation, Trace } from '../core/models.js';
const time = z.string().datetime({ offset: true }).refine(validTime);
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
  const fields = [
    'stringValue',
    'boolValue',
    'intValue',
    'doubleValue',
    'bytesValue',
    'arrayValue',
    'kvlistValue',
  ].filter((key) => key in r);
  if (!fields.length) return undefined;
  if (fields.length !== 1) throw new AwiError('Invalid OTLP AnyValue');
  const field = fields[0]!;
  const value = r[field];
  if (field === 'stringValue' || field === 'bytesValue') {
    if (typeof value !== 'string')
      throw new AwiError('Invalid OTLP string value');
    return value;
  }
  if (field === 'boolValue') {
    if (typeof value !== 'boolean')
      throw new AwiError('Invalid OTLP boolean value');
    return value;
  }
  if (field === 'doubleValue') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new AwiError('Invalid OTLP double value');
    return value;
  }
  if (field === 'intValue') {
    if (
      (typeof value !== 'string' || !/^[-]?\d{1,19}$/.test(value)) &&
      (typeof value !== 'number' || !Number.isSafeInteger(value))
    )
      throw new AwiError('Invalid OTLP integer value');
    const integer = BigInt(value as string | number);
    if (integer < -9223372036854775808n || integer > 9223372036854775807n)
      throw new AwiError('OTLP integer out of range');
    const number = Number(integer);
    return Number.isSafeInteger(number) ? number : String(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new AwiError('Invalid OTLP structured value');
  if (field === 'arrayValue') {
    const items = list(record(value).values ?? []).map(anyValue);
    return items.some((item) => item === undefined) ? undefined : items;
  }
  return attributes(record(value).values, true);
}
function attributes(v: unknown): Record<string, unknown>;
function attributes(
  v: unknown,
  complete: true,
): Record<string, unknown> | undefined;
function attributes(
  v: unknown,
  complete = false,
): Record<string, unknown> | undefined {
  const entries: [string, unknown][] = [];
  for (const attribute of list(v ?? [])) {
    const raw = record(attribute);
    if (typeof raw.key !== 'string')
      throw new AwiError('Invalid OTLP attribute key');
    const value = anyValue(raw.value);
    if (value === undefined && complete) return undefined;
    entries.push([raw.key, value]);
  }
  return Object.fromEntries(
    [...new Map(entries)].filter(([, value]) => value !== undefined),
  );
}
function attributeEncoding(
  values: unknown,
  key: string,
): Record<string, unknown> {
  const attribute = list(values ?? []).findLast(
    (item) => record(item).key === key,
  );
  return record(record(attribute).value);
}
function textAttribute(values: unknown, key: string): string | undefined {
  return string(attributeEncoding(values, key).stringValue);
}
function hasBinaryValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    ('bytesValue' in value || Object.values(value).some(hasBinaryValue))
  );
}
function timestamp(v: unknown): string | undefined {
  if (v === undefined || v === '0' || v === 0) return undefined;
  if (
    (typeof v !== 'string' || !/^\d{1,20}$/.test(v)) &&
    (typeof v !== 'number' || !Number.isSafeInteger(v))
  )
    throw new AwiError('Invalid OTLP nanosecond timestamp');
  const ns = BigInt(v as string | number);
  if (ns === 0n) return undefined;
  if (ns < 0n || ns > 18446744073709551615n)
    throw new AwiError('OTLP timestamp out of range');
  const iso = new Date(Number(ns / 1000000n)).toISOString();
  return ns % 1000000n === 0n
    ? iso
    : iso.replace(
        /\.\d{3}Z$/,
        '.' + (ns % 1000000000n).toString().padStart(9, '0') + 'Z',
      );
}
function otel(value: unknown): Trace[] {
  const grouped = new Map<string, Trace>();
  let total = 0;
  for (const resource of list(record(value).resourceSpans)) {
    const r = record(resource);
    const resourceAttributes = attributes(record(r.resource).attributes);
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
        const kind = textAttribute(s.attributes, 'gen_ai.operation.name');
        const tool =
          textAttribute(s.attributes, 'gen_ai.tool.name') ??
          textAttribute(s.attributes, 'tool.name');
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
                  ].includes(typeof kind === 'string' ? kind : '')
                ? 'model'
                : kind === 'workflow'
                  ? 'workflow'
                  : 'generic';
        const statusRecord = record(s.status);
        const status = statusRecord.code;
        const events = list(s.events ?? []).map(record);
        const exception = events.find((e) => e.name === 'exception');
        if (exception) attributes(exception.attributes);
        const exceptionType = textAttribute(
            exception?.attributes,
            'exception.type',
          ),
          exceptionMessage = textAttribute(
            exception?.attributes,
            'exception.message',
          );
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
        let args: unknown = hasBinaryValue(
          attributeEncoding(s.attributes, 'gen_ai.tool.call.arguments'),
        )
          ? undefined
          : a['gen_ai.tool.call.arguments'];
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* Preserve recorded string. */
          }
        }
        const startTime = timestamp(s.startTimeUnixNano),
          endTime = timestamp(s.endTimeUnixNano);
        const parent = string(s.parentSpanId);
        if (s.parentSpanId !== undefined && typeof s.parentSpanId !== 'string')
          throw new AwiError('Invalid OTLP parent identity');
        if (parent && !/^[a-fA-F0-9]{16}$/.test(parent))
          throw new AwiError('Invalid OTLP parent identity');
        const op: Operation = {
          id: id.toLowerCase(),
          type,
          name: string(s.name) || 'unnamed',
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
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          ...(args !== undefined ? { arguments: args } : {}),
          ...(Object.keys(usage).length ? { usage } : {}),
          ...(exception ||
          ((status === 2 || status === 'STATUS_CODE_ERROR') &&
            typeof statusRecord.message === 'string')
            ? {
                error: {
                  ...(exceptionType !== undefined
                    ? { code: exceptionType }
                    : {}),
                  ...(exceptionMessage !== undefined
                    ? { message: exceptionMessage }
                    : typeof statusRecord.message === 'string'
                      ? { message: statusRecord.message }
                      : {}),
                },
              }
            : {}),
          metadata: {
            'awi.operation_name_recorded':
              typeof s.name === 'string' && s.name.length > 0,
            attributes: a,
            resource: resourceAttributes,
            scope: record(scope).scope ?? {},
            events: s.events ?? [],
          },
          source: { format: 'otel', index: total - 1 },
        };
        if (args !== undefined) validateValue(args);
        const key = traceId.toLowerCase();
        if (!grouped.has(key))
          grouped.set(key, { version: 1, traceId: key, operations: [] });
        grouped.get(key)!.operations.push(op);
      }
  }
  const result = [...grouped.values()];
  validateValue(result);
  return result;
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
  if (format !== 'awi') throw new AwiError('Unsupported input format');
  const collection =
    'traces' in root
      ? z
          .strictObject({
            version: z.literal(1),
            traces: z.array(traceSchema).max(LIMITS.traces),
          })
          .safeParse(value)
      : null;
  if (collection) {
    if (!collection.success) throw new AwiError('Invalid AWI trace collection');
    if (
      collection.data.traces.reduce((n, t) => n + t.operations.length, 0) >
      LIMITS.spans
    )
      throw new AwiError('Maximum total span count exceeded');
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
