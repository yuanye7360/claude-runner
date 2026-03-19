import { env } from 'node:process';

import { defineConfig } from 'prisma/config';

// apps/web/prisma.config.ts
import 'dotenv/config';


export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env.DATABASE_URL || 'file:./claude-runner.db',
  },
});
