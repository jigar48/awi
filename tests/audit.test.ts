import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  analyze,
  ingest,
  resolveConfig,
  humanReport,
  AwiError,
  canonicalize,
  fingerprint,
  type Trace,
  type Operation,
} from '../src/index.js';
const trace = (operations: Operation[]): Trace => ({
  version: 1,
  traceId: 'audit',
  operations,
});
function op(i: number, overrides: Partial<Operation> = {}): Operation {
  return {
    id: String(i),
    type: 'tool',
    name: 'tool',
    arguments: {},
    status: 'error',
    startTime: new Date(1700000000000 + i * 1000).toISOString(),
    endTime: new Date(1700000000500 + i * 1000).toISOString(),
    ...overrides,
  };
}
function otlp(spans: unknown[], resource?: unknown): unknown {
  return {
    resourceSpans: [
      {
        ...(resource === undefined ? {} : { resource }),
        scopeSpans: [{ spans }],
      },
    ],
  };
}
const span = (i: number, overrides: Record<string, unknown> = {}) => ({
  traceId: 'a'.repeat(32),
  spanId: (i + 1).toString(16).padStart(16, '0'),
  name: 'tool',
  ...overrides,
});
describe('pre-release audit regressions', () => {
  it('preserves AWI002 defaults when only enabled is supplied', () => {
    expect(
      resolveConfig({ rules: { AWI002: { enabled: true } } }).rules.AWI002
        .threshold,
    ).toBe(3);
    expect(
      resolveConfig({ rules: { AWI002: {} } }).rules.AWI002.threshold,
    ).toBe(3);
  });
  it('rejects repetition thresholds larger than the bounded analysis window', () => {
    for (const id of ['AWI001', 'AWI002', 'AWI004'])
      expect(() =>
        resolveConfig({ rules: { [id]: { threshold: 101 } } }),
      ).toThrow(AwiError);
  });
  it('recognizes the failed-attempt storm that ends in recovery before another attempt', () => {
    const report = analyze([
      trace(
        ['error', 'error', 'error', 'error', 'ok', 'error'].map((status, i) =>
          op(i, { status: status as Operation['status'] }),
        ),
      ),
    ]);
    const storm = report.findings.find((f) => f.ruleId === 'AWI004');
    expect(storm?.operationIds).toEqual(['0', '1', '2', '3', '4']);
  });
  it('rejects unvalidated source references instead of leaking arbitrary values', () => {
    const operations = Array.from({ length: 4 }, (_, i) =>
      op(i, {
        source: {
          format: 'awi',
          index: { password: 'AUDIT_SECRET' },
        } as unknown as Operation['source'],
      }),
    );
    expect(() => analyze([trace(operations)])).toThrow(AwiError);
  });
  it('normalizes direct-library defaults and rejects malformed input with controlled errors', () => {
    const input = trace([
      op(0, { error: { code: undefined }, usage: { inputTokens: undefined } }),
    ]);
    input.metadata = undefined;
    delete (input.operations[0] as Partial<Operation>).status;
    const result = analyze([input], {}, true);
    expect((result.content?.[0]?.operations[0] as Operation).status).toBe(
      'unknown',
    );
    for (const value of [
      null,
      [null],
      [{ version: 1, traceId: 'bad', operations: null }],
    ])
      expect(() => analyze(value as unknown as Trace[])).toThrow(AwiError);
  });
  it('rejects getters before direct-library validation can execute them', () => {
    let read = false;
    const input = Object.defineProperty(
      { version: 1, traceId: 'bad' },
      'operations',
      {
        enumerable: true,
        get() {
          read = true;
          return [];
        },
      },
    );
    expect(() => analyze([input as Trace])).toThrow(AwiError);
    expect(read).toBe(false);
  });
  it('preserves exact submillisecond overlap and rejects reversed submillisecond endpoints', () => {
    const operations = Array.from({ length: 4 }, (_, i) =>
      op(i, {
        startTime: `2026-01-01T00:00:00.00${i}100000Z`,
        endTime: `2026-01-01T00:00:00.00${i + 1}900000Z`,
      }),
    );
    expect(analyze([trace(operations)]).findings).toEqual([]);
    expect(() =>
      analyze([
        trace([
          op(0, {
            startTime: '2026-01-01T00:00:00.000900000Z',
            endTime: '2026-01-01T00:00:00.000100000Z',
          }),
        ]),
      ]),
    ).toThrow('precedes');
  });
  it('does not retain the first overlapping operation as sequential evidence', () => {
    const operations = [0, 1, 2, 3].map((i) => op(i));
    operations.push(
      op(4, {
        startTime: operations[3]!.startTime,
        endTime: operations[3]!.endTime,
      }),
    );
    expect(analyze([trace(operations)]).findings).toEqual([]);
  });
  it('preserves nanosecond overlap in OTLP and accepts genuinely sequential nanosecond calls', () => {
    const attributes = [
      { key: 'gen_ai.tool.name', value: { stringValue: 'tool' } },
      { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{}' } },
    ];
    const make = (overlap: boolean) =>
      otlp(
        Array.from({ length: 4 }, (_, i) =>
          span(i, {
            attributes,
            startTimeUnixNano: String(
              1700000000000100000n + BigInt(i) * 1000000n,
            ),
            endTimeUnixNano: String(
              1700000000000100000n +
                BigInt(i) * 1000000n +
                (overlap ? 1800000n : 500000n),
            ),
          }),
        ),
      );
    expect(analyze(ingest(make(true))).findings).toEqual([]);
    expect(
      analyze(ingest(make(false))).findings.map((f) => f.ruleId),
    ).toContain('AWI001');
  });
  it('rejects malformed AnyValues rather than coercing them into usage or tool evidence', () => {
    for (const value of [
      { intValue: null },
      { intValue: '' },
      { intValue: true },
      { intValue: [] },
      { stringValue: {} },
      { boolValue: 'false' },
      { doubleValue: '4' },
      { stringValue: 'x', intValue: '1' },
    ])
      expect(() =>
        ingest(
          otlp([
            span(0, {
              attributes: [{ key: 'gen_ai.usage.input_tokens', value }],
            }),
          ]),
        ),
      ).toThrow(AwiError);
  });
  it('keeps absent arguments and missing OTLP tool identity unknown', () => {
    const operations = ingest(
      otlp([
        span(0, {
          attributes: [{ key: 'gen_ai.tool.call.arguments', value: {} }],
        }),
      ]),
    )[0]!.operations;
    expect(operations[0]!.arguments).toBeUndefined();

    const attributes = [
      { key: 'gen_ai.operation.name', value: { stringValue: 'execute_tool' } },
      { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{}' } },
    ];
    const spans = Array.from({ length: 4 }, (_, i) =>
      span(i, {
        name: '',
        attributes,
        startTimeUnixNano: String(
          1700000000000000000n + BigInt(i) * 1000000000n,
        ),
        endTimeUnixNano: String(1700000000500000000n + BigInt(i) * 1000000000n),
      }),
    );
    const unknown = analyze(ingest(otlp(spans)));
    expect(unknown.summaries[0]!.toolCalls).toBe(4);
    expect(unknown.findings).toEqual([]);
    expect(unknown.warnings.join(' ')).toContain('tool identity');
    const known = spans.map((s) => ({
      ...s,
      attributes: [
        ...attributes,
        { key: 'gen_ai.tool.name', value: { stringValue: 'known' } },
      ],
    }));
    expect(
      analyze(ingest(otlp(known))).findings.some((f) => f.ruleId === 'AWI001'),
    ).toBe(true);
  });
  it('does not overclassify array operation attributes or accept negative timestamps', () => {
    expect(
      ingest(
        otlp([
          span(0, {
            attributes: [
              {
                key: 'gen_ai.operation.name',
                value: { arrayValue: { values: [{ stringValue: 'chat' }] } },
              },
            ],
          }),
        ]),
      )[0]!.operations[0]!.type,
    ).toBe('generic');
    expect(() => ingest(otlp([span(0, { startTimeUnixNano: -1 })]))).toThrow(
      AwiError,
    );
  });
  it('uses explicit OTLP error status messages without exposing them', () => {
    const spans = Array.from({ length: 3 }, (_, i) =>
      span(i, {
        status: { code: 2, message: 'AUDIT_SECRET' },
        startTimeUnixNano: String(
          1700000000000000000n + BigInt(i) * 1000000000n,
        ),
        endTimeUnixNano: String(1700000000500000000n + BigInt(i) * 1000000000n),
        attributes: [
          { key: 'gen_ai.tool.name', value: { stringValue: 'tool' } },
          { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{}' } },
        ],
      }),
    );
    const result = analyze(ingest(otlp(spans)));
    expect(result.findings.map((f) => f.ruleId)).toContain('AWI002');
    expect(JSON.stringify(result)).not.toContain('AUDIT_SECRET');
  });
  it('does not treat empty recorded error fields as matching failure evidence', () => {
    const result = analyze([
      trace(
        Array.from({ length: 3 }, (_, i) =>
          op(i, { error: { code: '', message: '  ' } }),
        ),
      ),
    ]);
    expect(result.findings).toEqual([]);
  });
  it('is deterministic for reordered fragments of one trace including resource evidence', () => {
    const a = trace(
      Array.from({ length: 4 }, (_, i) =>
        op(i, { parentId: 'p', usage: { inputTokens: 2 } }),
      ),
    );
    const b = trace(
      Array.from({ length: 4 }, (_, i) =>
        op(i + 4, { parentId: 'q', usage: { inputTokens: 3 } }),
      ),
    );
    expect(analyze([a, b])).toEqual(analyze([b, a]));
  });
  it('sanitizes untrusted strings in public report rendering', () => {
    const report = analyze([trace([])]);
    report.warnings = ['unsafe\u001b[2J\u202e'];
    expect(humanReport(report)).not.toMatch(/[\u001b\u202e]/u);
  });
  it('enforces safe ignore-path syntax at public fingerprinting boundaries', () => {
    for (const path of [
      'a.*',
      'constructor.x',
      'a..b',
      Array(65).fill('a').join('.'),
    ])
      expect(() => canonicalize({ a: 1 }, [path])).toThrow(AwiError);
  });
});

it('uses exact retry window boundaries and timezone offsets', () => {
  const make = (fraction: string) =>
    trace(
      [0, 1, 2, 3]
        .map((i) =>
          op(i, {
            startTime: `2026-01-01T00:00:0${i}Z`,
            endTime: `2026-01-01T00:00:0${i}.5Z`,
          }),
        )
        .concat(
          op(4, {
            startTime: `2026-01-01T00:00:30${fraction}Z`,
            endTime: '2026-01-01T00:00:31Z',
          }),
        ),
    );
  expect(analyze([make('')]).findings.some((f) => f.ruleId === 'AWI004')).toBe(
    true,
  );
  expect(
    analyze([make('.000000001')]).findings.some((f) => f.ruleId === 'AWI004'),
  ).toBe(false);
  expect(() =>
    analyze([
      trace([
        op(0, {
          startTime: '2026-01-01T00:00:00.000000001+05:30',
          endTime: '2025-12-31T18:30:00.000000000Z',
        }),
      ]),
    ]),
  ).toThrow('precedes');
});
it('keeps unknown nested arguments unavailable and bounds OTLP numeric encodings', () => {
  for (const value of [
    { arrayValue: { values: [{}, { stringValue: 'known' }] } },
    { kvlistValue: { values: [{ key: 'x', value: {} }] } },
  ])
    expect(
      ingest(
        otlp([
          span(0, {
            attributes: [{ key: 'gen_ai.tool.call.arguments', value }],
          }),
        ]),
      )[0]!.operations[0]!.arguments,
    ).toBeUndefined();
  expect(
    ingest(otlp([span(0, { startTimeUnixNano: '00000' })]))[0]!.operations[0]!
      .startTime,
  ).toBeUndefined();
  for (const time of ['18446744073709551616', '9'.repeat(65536), false])
    expect(() => ingest(otlp([span(0, { startTimeUnixNano: time })]))).toThrow(
      AwiError,
    );
  let read = false;
  const malicious = Object.defineProperty(op(0), 'arguments', {
    get() {
      read = true;
      return {};
    },
    enumerable: true,
  });
  expect(() => fingerprint(malicious)).toThrow(AwiError);
  expect(read).toBe(false);
});
it('caps same-trace fragments deterministically without mutating caller data', () => {
  const operations = Array.from({ length: 1050 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) =>
      op(i * 3 + j, { parentId: 'p' + i, error: { code: 'X' } }),
    ),
  ).flat();
  const a = trace(operations.slice(0, 1500)),
    b = trace(operations.slice(1500));
  const before = JSON.stringify([a, b]);
  const first = analyze([a, b]),
    second = analyze([b, a]);
  expect(first.complete).toBe(false);
  expect(first.findings).toHaveLength(1000);
  expect(first).toEqual(second);
  expect(JSON.stringify([a, b])).toBe(before);
});

it('fingerprints valid large argument objects without applying input string limits to generated JSON', () => {
  const operation = op(0, {
    arguments: { b: 'y'.repeat(40000), a: 'x'.repeat(40000) },
  });
  const canonical = canonicalize(operation.arguments);
  const payload = {
    arguments: { present: true, value: canonical },
    tool: 'tool',
    type: 'tool',
    version: 'awi-sha256-v1',
  };
  expect(fingerprint(operation)).toBe(
    createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  );
});

it('bounds default report amplification from long operation identifiers', () => {
  const operations = Array.from({ length: 250 }, (_, i) =>
    op(i, {
      id: String(i) + 'x'.repeat(65500),
      toolName: i % 2 ? 'a' : 'b',
      error: { code: 'X' },
      usage: { inputTokens: 1 },
    }),
  );
  expect(() => analyze([trace(operations)])).toThrow(
    'Report exceeds resource limits',
  );
});

it('does not interpret binary attributes as semantic text or keep stale duplicate argument evidence', () => {
  const binary = ingest(
    otlp([
      span(0, {
        attributes: [
          { key: 'gen_ai.operation.name', value: { bytesValue: 'chat' } },
          { key: 'gen_ai.tool.name', value: { bytesValue: 'tool' } },
          { key: 'gen_ai.tool.call.arguments', value: { bytesValue: 'e30=' } },
        ],
      }),
    ]),
  )[0]!.operations[0]!;
  expect(binary.type).toBe('generic');
  expect(binary.arguments).toBeUndefined();
  const duplicate = ingest(
    otlp([
      span(0, {
        attributes: [
          { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{}' } },
          { key: 'gen_ai.tool.call.arguments', value: {} },
        ],
      }),
    ]),
  )[0]!.operations[0]!;
  expect(duplicate.arguments).toBeUndefined();
});

it('invalidates compiled ignore paths safely when a caller mutates them', () => {
  const paths = ['a'];
  expect(canonicalize({ a: 1, b: 2 }, paths)).toBe('{"b":2}');
  paths[0] = 'b';
  expect(canonicalize({ a: 1, b: 2 }, paths)).toBe('{"a":1}');
  let read = false;
  Object.defineProperty(paths, '0', {
    get() {
      read = true;
      return 'a';
    },
  });
  expect(() => canonicalize({}, paths)).toThrow(AwiError);
  expect(read).toBe(false);
});

it('detects repeated tools across interleaved model spans without attributing model tokens', () => {
  const operations = Array.from({ length: 6 }, (_, i) => [
    op(i * 2, {
      id: 'm' + i,
      type: 'model',
      name: 'generation',
      status: 'ok',
      usage: { inputTokens: 100 },
    }),
    op(i * 2 + 1, {
      id: 't' + i,
      toolName: i % 2 ? 'b' : 'a',
      error: { code: 'X' },
    }),
  ]).flat();
  const result = analyze([trace(operations)]);
  expect(result.findings.filter((f) => f.ruleId === 'AWI002')).toHaveLength(2);
  expect(result.findings.filter((f) => f.ruleId === 'AWI003')).toHaveLength(1);
  expect(result.findings.some((f) => f.ruleId === 'AWI006')).toBe(false);
  expect(result.summaries[0]!.usage).toEqual({ inputTokens: 600 });
  const success = operations
    .slice(0, 8)
    .map((o) =>
      o.type === 'tool'
        ? { ...o, toolName: 'same', status: 'ok' as const, error: undefined }
        : o,
    );
  expect(
    analyze([trace(success)]).findings.some((f) => f.ruleId === 'AWI001'),
  ).toBe(true);
  const overlap = success.map((o) =>
    o.id === 'm0' ? { ...o, endTime: success.at(-1)!.endTime } : o,
  );
  expect(analyze([trace(overlap)]).findings).toEqual([]);
});
