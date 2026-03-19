import process from 'node:process';

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL || 'file:./claude-runner.db';

const prismaClientSingleton = () => {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
};

declare const globalThis: typeof global & {
  prismaGlobal?: PrismaClient;
};

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
