import { timeNanoseconds } from './timestamps.js';
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
      timeNanoseconds(op.endTime) < timeNanoseconds(op.startTime)
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
        timeNanoseconds(o.endTime) <= timeNanoseconds(o.startTime),
    )
  )
    return [];
  const timed = ops
    .map((op) => ({
      op,
      start: timeNanoseconds(op.startTime!),
      end: timeNanoseconds(op.endTime!),
    }))
    .sort((a, b) =>
      a.start < b.start
        ? -1
        : a.start > b.start
          ? 1
          : a.op.id < b.op.id
            ? -1
            : a.op.id > b.op.id
              ? 1
              : 0,
    );
  const runs: Operation[][] = [];
  let run: typeof timed = [];
  let overlapEnd: bigint | undefined;
  for (const item of timed) {
    if (overlapEnd !== undefined) {
      if (item.start < overlapEnd) {
        if (item.end > overlapEnd) overlapEnd = item.end;
        continue;
      }
      overlapEnd = undefined;
    }
    const previous = run.at(-1);
    if (previous && item.start < previous.end) {
      run.pop();
      if (run.length) runs.push(run.map((value) => value.op));
      run = [];
      overlapEnd = previous.end > item.end ? previous.end : item.end;
      continue;
    }
    run.push(item);
  }
  if (run.length) runs.push(run.map((value) => value.op));
  return runs;
}
