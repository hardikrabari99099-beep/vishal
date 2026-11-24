import { describe, expect, it } from "vitest";
import {
  collectSettingsDiffs,
  deepMergeObjects,
} from "@/server/ai-site-editor";

describe("AI Site Editor patch utilities", () => {
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
});
