import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { contentDocs } from "../../db/schema";

type DocRecord = Record<string, unknown> & { id: string };

interface ContentStore {
  all: (collection: string) => Promise<DocRecord[]>;
  get: (collection: string, id: string) => Promise<DocRecord | null>;
  put: (collection: string, doc: DocRecord) => Promise<DocRecord>;
  del: (collection: string, id: string) => Promise<unknown>;
  delAll: (collection: string) => Promise<unknown>;
  findOne: (
    collection: string,
    predicate: (doc: DocRecord) => boolean,
  ) => Promise<DocRecord | null>;
}

export function persistentContentStore(fallback: ContentStore): ContentStore {
  const persistentCollections = new Set([
    "settings",
    "stories",
    "users",
    "local_credentials",
    "trader_accounts",
    "orders",
    "virtual_orders",
    "virtual_positions",
    "virtual_trades",
    "fund_transactions",
    "payout_requests",
    "referrals",
    "journal_entries",
    "risk_events",
    "risk_breaches",
    "user_notifications",
    "support_tickets",
    "certificates",
    "insights",
    "leads",
    "league_registrations",
    "weekly_payouts",
    "ai_revisions",
    "system_meta",
  ]);
  const persistent = (collection: string) =>
    persistentCollections.has(collection);
  const all = async (collection: string): Promise<DocRecord[]> => {
    if (!persistent(collection)) return fallback.all(collection);
    try {
      const rows = await db
        .select()
        .from(contentDocs)
        .where(eq(contentDocs.collection, collection));
      return rows.map((row) => row.data as DocRecord);
    } catch {
      return fallback.all(collection);
    }
  };
  const get = async (
    collection: string,
    id: string,
  ): Promise<DocRecord | null> => {
    if (!persistent(collection)) return fallback.get(collection, id);
    try {
      const rows = await db
        .select()
        .from(contentDocs)
        .where(
          and(
            eq(contentDocs.collection, collection),
            eq(contentDocs.id, String(id)),
          ),
        );
      return (rows[0]?.data as DocRecord | undefined) ?? null;
    } catch {
      return fallback.get(collection, id);
    }
  };
  const put = async (
    collection: string,
    doc: DocRecord,
  ): Promise<DocRecord> => {
    if (!persistent(collection)) return fallback.put(collection, doc);
    try {
      await db
        .insert(contentDocs)
        .values({ collection, id: String(doc.id), data: doc })
        .onConflictDoUpdate({
          target: [contentDocs.collection, contentDocs.id],
          set: { data: doc },
        });
      return doc;
    } catch {
      return fallback.put(collection, doc);
    }
  };
  const del = async (collection: string, id: string) => {
    if (!persistent(collection)) return fallback.del(collection, id);
    try {
      return await db
        .delete(contentDocs)
        .where(
          and(
            eq(contentDocs.collection, collection),
            eq(contentDocs.id, String(id)),
          ),
        );
    } catch {
      return fallback.del(collection, id);
    }
  };
  const delAll = async (collection: string) => {
    if (!persistent(collection)) return fallback.delAll(collection);
    try {
      return await db
        .delete(contentDocs)
        .where(eq(contentDocs.collection, collection));
    } catch {
      return fallback.delAll(collection);
    }
  };
  const findOne = async (
    collection: string,
    predicate: (doc: DocRecord) => boolean,
  ) => (await all(collection)).find(predicate) || null;
  return { all, get, put, del, delAll, findOne };
}
