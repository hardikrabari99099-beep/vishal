import { jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const contentDocs = pgTable(
  "content_docs",
  {
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.collection, table.id] })],
);
