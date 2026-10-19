import { format } from 'prettier';
import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { traceSchema, configSchema, reportSchema } from '../dist/index.js';
mkdirSync('docs/schemas', { recursive: true });
for (const [name, schema] of Object.entries({
  trace: traceSchema,
  config: configSchema,
  report: reportSchema,
}))
  writeFileSync(
    `docs/schemas/${name}.schema.json`,
    await format(JSON.stringify(z.toJSONSchema(schema)), { parser: 'json' }),
  );
