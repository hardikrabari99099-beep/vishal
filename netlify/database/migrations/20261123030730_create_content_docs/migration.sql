CREATE TABLE "content_docs" (
	"collection" text,
	"id" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "content_docs_pkey" PRIMARY KEY("collection","id")
);
