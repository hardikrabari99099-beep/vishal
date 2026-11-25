import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectSettingsDiffs,
  deepMergeObjects,
  generateAiSiteEdit,
} from "@/server/ai-site-editor";
import { generateTradeInsights } from "@/server/insights";

describe("AI Site Editor patch utilities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.LOVABLE_API_KEY;
  });

  it("deep merges nested site_settings without wiping sibling keys", () => {
    const current = {
      hero: {
        chip: "Old chip",
        title_before: "Old title",
        cta_primary: "Start Challenge",
      },
      evaluation_risk: {
        profit_target_pct: 8,
        max_loss_limit: 20,
        daily_loss_limit_pct: 5,
      },
    };
    const patch = {
      hero: {
        title_before: "New title",
      },
      evaluation_risk: {
        profit_target_pct: 10,
      },
    };
    const merged = deepMergeObjects(current, patch) as typeof current;
    expect(merged.hero.title_before).toBe("New title");
    expect(merged.hero.chip).toBe("Old chip");
    expect(merged.hero.cta_primary).toBe("Start Challenge");
    expect(merged.evaluation_risk.profit_target_pct).toBe(10);
    expect(merged.evaluation_risk.max_loss_limit).toBe(20);
  });

  it("collects readable field-level diffs only for modified keys", () => {
    const before = {
      announcement: { enabled: false, text: "Welcome" },
      contact: { email: "support@indifunded.com" },
    };
    const patch = {
      announcement: { enabled: true, text: "Diwali Offer Live" },
      contact: { email: "support@indifunded.com" },
    };
    const diffs = collectSettingsDiffs(before, patch);
    expect(diffs).toEqual([
      { path: "announcement.enabled", before: "false", after: "true" },
      {
        path: "announcement.text",
        before: "Welcome",
        after: "Diwali Offer Live",
      },
    ]);
  });

  it("calls OpenAI Chat Completions for generateAiSiteEdit and strips protected fields", async () => {
    process.env.OPENAI_API_KEY = "sk-test-mock-openai-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Enabled festive announcement bar.",
                  summary_bullets: ["Turned on announcement banner"],
                  settings_patch_json: JSON.stringify({
                    announcement: { enabled: true, text: "Festive 25% Off" },
                    smtp_password: "should-be-stripped",
                  }),
                  plan_actions: [],
                  blog_actions: [],
                  coupon_actions: [
                    {
                      action: "create",
                      id: null,
                      data_json: JSON.stringify({
                        code: "FEST25",
                        discount_percent: 25,
                      }),
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const plan = await generateAiSiteEdit({
      prompt: "Enable festive announcement and FEST25 coupon",
      currentSettings: { announcement: { enabled: false } },
      plans: [],
      blogs: [],
      coupons: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-test-mock-openai-key",
    );
    expect(plan.settings_patch).toEqual({
      announcement: { enabled: true, text: "Festive 25% Off" },
    });
    expect(plan.coupon_actions).toEqual([
      {
        action: "create",
        data: { code: "FEST25", discount_percent: 25 },
      },
    ]);
  });

  it("calls OpenAI Chat Completions for generateTradeInsights", async () => {
    process.env.OPENAI_API_KEY = "sk-test-mock-openai-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  headline: "Disciplined Nifty Scalping",
                  summary: "Good risk discipline overall.",
                  score: 104,
                  metrics: [{ label: "Win Rate", value: "62%" }],
                  strengths: ["Consistent stop loss"],
                  weaknesses: ["Slightly early exits"],
                  risk_flags: [],
                  next_steps: [
                    {
                      title: "Hold winners longer",
                      detail: "Trail stops to 1:2 RR.",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTradeInsights({
      history: "NIFTY 24500 CE +2500\nBANKNIFTY 52000 PE -900",
      rules: { max_loss_limit: 20, trades_per_day: 3 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.headline).toBe("Disciplined Nifty Scalping");
    expect(result.score).toBe(100);
  });
});
