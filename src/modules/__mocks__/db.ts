import { mock } from "bun:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export function createMockDb(): PostgresJsDatabase {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: "test-id" }])),
      })),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([])),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => Promise.resolve({ rowsAffected: 1 })),
      })),
    })),
  } as any;
}
