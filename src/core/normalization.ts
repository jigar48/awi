import type { Operation, Trace } from './models.js';
import { AwiError, LIMITS } from '../security/index.js';
export interface Normalized {
  trace: Trace;
  depth: number;
  warnings: string[];
  children: Map<string, Operation[]>;
}
export function normalize(trace: Trace): Normalized {
  if (trace.operations.length > LIMITS.spans)
    throw new AwiError('Maximum span count exceeded');
  const ids = new Map<string, Operation>();
  const warnings: string[] = [];
  for (const op of trace.operations) {
    if (ids.has(op.id)) throw new AwiError('Duplicate operation identity');
    ids.set(op.id, op);
    if (
      op.startTime &&
      op.endTime &&
      Date.parse(op.endTime) < Date.parse(op.startTime)
    )
      throw new AwiError('End timestamp precedes start timestamp');
  }
  const depths = new Map<string, number>();
  let depth = 0;
  for (const op of trace.operations) {
    const path: Operation[] = [];
    const seen = new Set<string>();
    let current: Operation | undefined = op;
    while (current && !depths.has(current.id)) {
      if (seen.has(current.id)) throw new AwiError('Cyclic parent references');
      seen.add(current.id);
      path.push(current);
      const parent: Operation | undefined = current.parentId
        ? ids.get(current.parentId)
        : undefined;
      if (current.parentId && !parent)
        warnings.push(
          'Missing parent reference; observed depth is a lower bound.',
        );
      current = parent;
    }
    let d = current ? depths.get(current.id)! : 0;
    for (const item of path.reverse()) {
      depths.set(item.id, ++d);
      depth = Math.max(depth, d);
    }
  }
  const children = new Map<string, Operation[]>();
  for (const op of trace.operations) {
    const key = op.parentId ?? '';
    const group = children.get(key) ?? [];
    group.push(op);
    children.set(key, group);
  }
  // Preserve recorded order; only fully timed, non-overlapping sibling operations establish sequence evidence.
  return { trace, depth, warnings: [...new Set(warnings)], children };
}
export function sequentialRuns(ops: Operation[]): Operation[][] {
  if (
    ops.some(
      (o) =>
        !o.startTime ||
        !o.endTime ||
        Date.parse(o.endTime) <= Date.parse(o.startTime),
    )
  )
    return [];
  const timed = ops
    .filter((o) => o.startTime && o.endTime)
    .sort(
      (a, b) =>
        Date.parse(a.startTime!) - Date.parse(b.startTime!) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const runs: Operation[][] = [];
  let run: Operation[] = [];
  let end = -Infinity;
  for (const op of timed) {
    const start = Date.parse(op.startTime!);
    const finish = Date.parse(op.endTime!);
    if (start < end) {
      if (run.length) runs.push(run);
      run = [];
      end = Math.max(end, finish);
      continue;
    }
    run.push(op);
    end = finish;
  }
  if (run.length) runs.push(run);
  return runs;
}
