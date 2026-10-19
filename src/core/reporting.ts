import { safeText } from '../security/index.js';
import type { Report } from './models.js';
export function humanReport(
  report: Report,
  options: { color?: boolean } = {},
): string {
  const paint = (text: string, severity: string) =>
    options.color
      ? `\u001b[${severity === 'high' ? 31 : 33}m${text}\u001b[0m`
      : text;
  const lines = [
    'Agent Workflow Inspector — Find loops, retries, and wasted work in AI agent traces.',
  ];
  for (const t of report.summaries)
    lines.push(
      `Trace ${safeText(t.traceId)}: ${t.operations} operations, ${t.toolCalls} tool calls, depth ${t.maxDepth}; duration ${t.durationMs === undefined ? 'unknown' : t.durationMs + ' ms'}; recorded leaf usage ${t.usage ? JSON.stringify(t.usage) : 'unknown'}`,
    );
  for (const f of report.findings)
    lines.push(
      `\n${paint('[' + f.severity.toUpperCase() + ']', f.severity)} ${f.ruleId} ${f.title} (${f.confidence} evidence)`,
      `  Trace: ${safeText(f.traceId)}; operations: ${f.operationIds.map(safeText).join(', ') || 'trace-wide'}`,
      `  ${f.explanation}`,
      `  Evidence: ${safeText(JSON.stringify(f.evidence))}`,
    );
  for (const warning of report.warnings) lines.push('Warning: ' + warning);
  if (report.content)
    lines.push(
      'Content (opt-in, key-based redaction): ' +
        safeText(JSON.stringify(report.content)),
    );
  lines.push(
    `\n${report.findings.length} findings; analysis ${report.complete ? 'complete' : 'INCOMPLETE'}.`,
  );
  return lines.join('\n') + '\n';
}

export function jsonReport(report: Report): string {
  return (
    JSON.stringify(report, null, 2).replace(
      /[\u007f-\u009f\p{Cf}\p{Zl}\p{Zp}]/gu,
      (value) =>
        value
          .split('')
          .map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
          .join(''),
    ) + '\n'
  );
}
