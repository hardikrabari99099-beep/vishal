// Server-only: OpenAI-powered A-to-Z Site Editor for IndiFunded Admin.
import {
  OpenAiClientError,
  callOpenAiChat,
  readOpenAiApiKey,
} from "./openai-client";

export class AiEditorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type CollectionAction = {
  action: "create" | "update" | "delete";
  id?: string;
  data: Record<string, unknown>;
};

export type AiSiteEditPlan = {
  reply: string;
  summary_bullets: string[];
  settings_patch: Record<string, unknown>;
  plan_actions: CollectionAction[];
  blog_actions: CollectionAction[];
  coupon_actions: CollectionAction[];
};

const actionItemSchema = (dataDescription: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["action", "id", "data_json"],
  properties: {
    action: {
      type: "string",
      enum: ["create", "update", "delete"],
      description: "One of: create, update, delete",
    },
    id: {
      type: ["string", "null"],
      description: "Existing item id for update or delete, or null for create",
    },
    data_json: {
      type: "string",
      description: dataDescription,
    },
  },
});

const responseSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "summary_bullets",
    "settings_patch_json",
    "plan_actions",
    "blog_actions",
    "coupon_actions",
  ],
  properties: {
    reply: {
      type: "string",
      description:
        "Clear, concise message explaining every edit prepared for the admin (max 2-3 sentences).",
    },
    summary_bullets: {
      type: "array",
      items: { type: "string" },
      description:
        "Exact bullet list of every change made across settings, plans, blogs, or coupons.",
    },
    settings_patch_json: {
      type: "string",
      description:
        "Strict JSON string representing a partial deep-merge patch for site_settings. Return '{}' if only plans/blogs/coupons are changing.",
    },
    plan_actions: {
      type: "array",
      description:
        "Optional create/update/delete operations on challenge plans. Return [] if none.",
      items: actionItemSchema(
        "JSON string with plan fields (name, account_size, challenge_fee, original_price, profit_target_points, profit_share, max_loss_limit, min_trading_days, total_trading_days, trades_per_day, description, features[], popular, order).",
      ),
    },
    blog_actions: {
      type: "array",
      description:
        "Optional create/update/delete operations on blog posts. Return [] if none.",
      items: actionItemSchema(
        "JSON string with blog fields (title, slug, excerpt, content, author, published).",
      ),
    },
    coupon_actions: {
      type: "array",
      description:
        "Optional create/update/delete operations on discount coupon codes. Return [] if none.",
      items: actionItemSchema(
        "JSON string with coupon fields (code, discount_percent, active, description, max_uses).",
      ),
    },
  },
};

function safeParseJsonObject(
  raw: unknown,
  fallback = {},
): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
}

export function deepMergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (
      base &&
      typeof base[k] === "object" &&
      base[k] !== null &&
      !Array.isArray(base[k]) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out[k] = deepMergeObjects(
        base[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type DiffEntry = {
  path: string;
  before: string;
  after: string;
};

function summarizeVal(v: unknown): string {
  if (v === undefined) return "(unset)";
  if (v === null) return "null";
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  return JSON.stringify(v).slice(0, 120);
}

export function collectSettingsDiffs(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  prefix = "",
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  for (const [k, v] of Object.entries(patch || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    const prevVal = before ? before[k] : undefined;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      prevVal &&
      typeof prevVal === "object" &&
      !Array.isArray(prevVal)
    ) {
      diffs.push(
        ...collectSettingsDiffs(
          prevVal as Record<string, unknown>,
          v as Record<string, unknown>,
          path,
        ),
      );
    } else if (JSON.stringify(prevVal) !== JSON.stringify(v)) {
      diffs.push({
        path,
        before: summarizeVal(prevVal),
        after: summarizeVal(v),
      });
    }
  }
  return diffs;
}

export async function generateAiSiteEdit(input: {
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  currentSettings: Record<string, unknown>;
  plans: Array<Record<string, unknown>>;
  blogs: Array<Record<string, unknown>>;
  coupons: Array<Record<string, unknown>>;
}): Promise<AiSiteEditPlan> {
  const userPrompt = String(input.prompt || "").trim();
  if (!userPrompt) {
    throw new AiEditorError(
      400,
      "Please describe what you want to change on the site.",
    );
  }
  if (userPrompt.length > 8000) {
    throw new AiEditorError(400, "Prompt is too long (max 8,000 characters).");
  }

  const apiKey = readOpenAiApiKey();
  if (!apiKey) {
    throw new AiEditorError(
      503,
      "OPENAI_API_KEY is not configured. Add it in Settings > Secrets to use the AI Site Editor.",
    );
  }

  const compactBlogs = input.blogs.map((b) => ({
    id: b["id"],
    slug: b["slug"],
    title: b["title"],
    published: b["published"],
  }));

  const contextSnapshot = {
    site_settings: input.currentSettings,
    plans: input.plans,
    blogs: compactBlogs,
    coupons: input.coupons,
  };

  const recentHistory = (input.history || [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Admin" : "Assistant"}: ${m.text}`)
    .join("\n");

  const systemInstruction = `You are the A-to-Z Site Editor AI inside the IndiFunded Admin Panel (India's proprietary trading firm for NSE, BSE, NIFTY, BANKNIFTY, SENSEX, and INR funded trader challenges).

Your job is to translate the admin's natural-language instruction into an exact, valid structured edit across:
1. \`site_settings\` (passed via \`settings_patch_json\` as a partial deep-merge JSON object). Key sections:
   - \`brand\`: { name, logo_url, tagline }
   - \`contact\`: { email, phone, whatsapp, upi_id, company, address, office }
   - \`social\`: { instagram, youtube, twitter, facebook, whatsapp_link }
   - \`announcement\`: { enabled (boolean), text, link, cta }
   - \`widgets\`: { sticky_cta: { enabled, label, link }, scroll_progress: { enabled }, bg_3d: { enabled } }
   - \`hero\`: { chip, title_before, title_highlight, title_after, subtitle, cta_primary, cta_secondary, stats: [{ k, v }] }
   - \`ratings\`: { enabled, heading, subtitle, items: [{ platform, rating, out_of, reviews, color, url }] }
   - \`steps\`: { title_prefix, title_suffix, items: [{ n, t, d }] }
   - \`home_sections\`: { plans, payouts, trader_videos, success_stories, trust, reviews, steps, benefits, calculator, community, blogs, faq, support } (booleans)
   - \`evaluation_risk\`: { profit_target_pct, max_loss_limit, daily_loss_limit_pct, min_trading_days, total_trading_days, trades_per_day, profit_accuracy_pct, profit_split } (numbers — updates ALL user accounts!)
   - \`trust\`: { enabled, stories_enabled, heading, subtitle, stats: [{ label, value }], company: { legal_name, gst, cin, pan, address, phone, email, instagram, telegram }, documents, support_team, payout_proofs, credentials, stories }
   - \`video_reviews\`: { enabled, heading, subtitle, items }
   - \`testimonials\`: [{ q, a, r }]
   - \`faq_groups\`: [{ title, items: [{ q, a }] }]
   - \`rules\`: { title, subtitle, items: [{ t, d, i }] }
   - \`about\`: { title, intro, cards: [{ t, d }], footer_title, footer_text }
   - \`benefits\`: { title, subtitle, items: [{ t, d, i }] }
   - \`live_counter\`: { enabled, heading, items: [{ label, value, prefix, suffix }] }
   - \`payouts_page\`: { heading, subtitle, show_request_form, items: [{ name, plan, amount, city, days_ago }] }
2. \`plan_actions\` (create / update / delete challenge plans — e.g. changing challenge fees, account sizes, features, popular badge).
3. \`blog_actions\` (create / update / delete blog posts with clean markdown content, title, slug, excerpt).
4. \`coupon_actions\` (create / update / delete coupon codes with uppercase code, discount_percent, active, description, max_uses).

Rules:
- ONLY include keys in \`settings_patch_json\` that you actually want to change! Never wipe untouched sections.
- Remember that arrays inside \`settings_patch_json\` (like \`hero.stats\`, \`testimonials\`, \`faq_groups\`, \`rules.items\`, \`benefits.items\`) replace the whole array when included, so preserve existing items you weren't asked to delete.
- Never invent fake secrets or external unverified video/image URLs unless the admin specifically provided them.
- Keep all Indian market references accurate (NSE, BSE, NIFTY 50, BANK NIFTY, SENSEX, INR ₹).
- If updating a plan, blog, or coupon, always reference its exact \`id\` from the live snapshot.`;

  const contents = `${recentHistory ? `Recent conversation:\n${recentHistory}\n\n` : ""}Current live site snapshot (JSON):
${JSON.stringify(contextSnapshot)}

Admin instruction:
${userPrompt}`;

  try {
    const rawText = await callOpenAiChat({
      apiKey,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: contents },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "site_edit_plan",
          strict: true,
          schema: responseSchema,
        },
      },
      temperature: 0.2,
      timeoutMs: 60000,
    });

    const parsed = JSON.parse(rawText) as {
      reply?: string;
      summary_bullets?: string[];
      settings_patch_json?: string;
      plan_actions?: Array<{
        action?: string;
        id?: string | null;
        data_json?: string;
      }>;
      blog_actions?: Array<{
        action?: string;
        id?: string | null;
        data_json?: string;
      }>;
      coupon_actions?: Array<{
        action?: string;
        id?: string | null;
        data_json?: string;
      }>;
    };

    const settings_patch = safeParseJsonObject(parsed.settings_patch_json, {});
    // Strip protected fields
    delete settings_patch["_id"];
    delete settings_patch["id"];
    delete settings_patch["email_config"];
    delete settings_patch["smtp_password"];

    const normalizeActions = (
      arr:
        | Array<{ action?: string; id?: string | null; data_json?: string }>
        | undefined,
    ): CollectionAction[] =>
      (arr || [])
        .filter(
          (a) => a && ["create", "update", "delete"].includes(String(a.action)),
        )
        .map((a) => ({
          action: a.action as "create" | "update" | "delete",
          ...(a.id ? { id: String(a.id) } : {}),
          data: safeParseJsonObject(a.data_json, {}),
        }));

    return {
      reply: String(parsed.reply || "Prepared site updates for review."),
      summary_bullets: Array.isArray(parsed.summary_bullets)
        ? parsed.summary_bullets.map(String)
        : [],
      settings_patch,
      plan_actions: normalizeActions(parsed.plan_actions),
      blog_actions: normalizeActions(parsed.blog_actions),
      coupon_actions: normalizeActions(parsed.coupon_actions),
    };
  } catch (err: unknown) {
    if (err instanceof AiEditorError) throw err;
    if (err instanceof OpenAiClientError) {
      throw new AiEditorError(err.status, err.message);
    }
    const msg = err instanceof Error ? err.message : String(err || "");
    throw new AiEditorError(
      502,
      `AI Site Editor failed: ${msg || "unexpected upstream error"}`,
    );
  }
}
