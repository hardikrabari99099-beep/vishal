import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema";

type NetlifyDb = ReturnType<typeof drizzle>;

function createMockDb(): NetlifyDb {
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  return new Proxy({} as NetlifyDb, {
    get(_target, prop) {
      if (prop === "query") return new Proxy({}, { get: () => noOp });
      if (prop === "select" || prop === "insert" || prop === "delete") {
        throw new Error("[AI Studio] Netlify database is not connected");
      }
      return async () => [];
    },
  });
}

let _db: NetlifyDb | undefined;

export const db = new Proxy({} as NetlifyDb, {
  get(_target, prop) {
    if (!_db) {
      try {
        _db = drizzle({ schema } as unknown as Parameters<
          typeof drizzle
        >[0]) as NetlifyDb;
      } catch {
        console.warn("[AI Studio] Database not connected — using mock");
        _db = createMockDb();
      }
    }
    const value = Reflect.get(_db as object, prop);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});
