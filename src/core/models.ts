export type Severity = 'low' | 'medium' | 'high';
export type RuleId =
  'AWI001' | 'AWI002' | 'AWI003' | 'AWI004' | 'AWI005' | 'AWI006';
export interface Operation {
  id: string;
  parentId?: string;
  type: 'tool' | 'agent' | 'model' | 'workflow' | 'generic';
  name: string;
  toolName?: string;
  startTime?: string;
  endTime?: string;
  status: 'ok' | 'error' | 'unknown';
  error?: { code?: string; message?: string };
  arguments?: unknown;
  resultMetadata?: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  cost?: { amount: number; currency: string };
  metadata?: Record<string, unknown>;
  source?: { format: 'awi' | 'otel'; index: number };
}
export interface Trace {
  version: 1;
  traceId: string;
  metadata?: Record<string, unknown>;
  operations: Operation[];
}
export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  confidence: 'high' | 'moderate';
  title: string;
  description: string;
  explanation: string;
  remediation: string;
  traceId: string;
  operationIds: string[];
  evidence: Record<string, unknown>;
}
export interface TraceSummary {
  traceId: string;
  operations: number;
  toolCalls: number;
  maxDepth: number;
  durationMs?: number;
  usage?: Operation['usage'];
}
export interface Report {
  version: 1;
  fingerprintVersion: 'awi-sha256-v1';
  complete: boolean;
  summaries: TraceSummary[];
  findings: Finding[];
  warnings: string[];
  content?: { traceId: string; operations: unknown[] }[];
}
