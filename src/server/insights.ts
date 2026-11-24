// Server-only: turns a trader's pasted/uploaded trading history into AI performance insights.
import { GoogleGenAI, Type } from "@google/genai";
import {
  generateResponse,
  GatewayError,
  PaymentRequiredError,
  RateLimitError,
} from "@lovable.dev/ai-gateway";

export const MAX_HISTORY_CHARS = 30000;

export type TradeInsights = {
  headline: string;
  summary: string;
  score: number;
  metrics: { label: string; value: string }[];
  strengths: string[];
  weaknesses: string[];
  risk_flags: string[];
  next_steps: { title: string; detail: string }[];
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "score",
    "metrics",
    "strengths",
    "weaknesses",
    "risk_flags",
    "next_steps",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    metrics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: { label: { type: "string" }, value: { type: "string" } },
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    risk_flags: { type: "array", items: { type: "string" } },
    next_steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
} as const;

const geminiSchema = {
  type: Type.OBJECT,
  required: [
    "headline",
    "summary",
    "score",
    "metrics",
    "strengths",
    "weaknesses",
    "risk_flags",
    "next_steps",
  ],
  properties: {
    headline: { type: Type.STRING },
    summary: { type: Type.STRING },
    score: { type: Type.INTEGER },
    metrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["label", "value"],
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
      },
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    risk_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
    next_steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "detail"],
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
      },
    },
  },
};

export class InsightsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function generateTradeInsights(input: {
  history: string;
  notes?: string;
  rules: {
    profit_target_points?: number;
    max_loss_limit?: number;
    trades_per_day?: number;
    min_trading_days?: number;
  } | null;
}): Promise<TradeInsights> {
  const rules = input.rules
    ? `Challenge rules: profit target ${input.rules.profit_target_points ?? "?"} points, max loss ${input.rules.max_loss_limit ?? 20}% of account, max ${input.rules.trades_per_day ?? 3} trades per day, minimum ${input.rules.min_trading_days ?? "?"} trading days.`
    : "Challenge rules: max loss 20% of account, max 3 trades per day.";

  const systemPrompt =
    "You are a trading performance coach for IndiFunded, an Indian prop trading firm (NSE/BSE, Nifty, BankNifty, F&O, simulated challenge accounts in INR). Analyse the trader's history objectively. Compute what you can (win rate, average win/loss, risk-reward, largest loss, trades per day, best/worst instruments or times). Flag any rule breaches. Give 3-5 concrete, actionable next steps. Use INR (₹) and plain, encouraging language. Never promise profits or give buy/sell recommendations for specific securities. If the data is too thin, say so and keep metrics limited to what is supported.";
  const userPrompt = `${rules}\n\nTrader notes: ${input.notes?.trim() || "none"}\n\nTrading history (CSV or free text):\n${input.history}`;

  const geminiKey = String(process.env["GEMINI_API_KEY"] || "").trim();
  const hasGemini = Boolean(geminiKey && !/^MY_/i.test(geminiKey));
  const lovableKey = String(process.env["LOVABLE_API_KEY"] || "").trim();

  if (!hasGemini && !lovableKey) {
    throw new InsightsError(
      503,
      "AI insights are not configured yet. Add GEMINI_API_KEY in Settings > Secrets.",
    );
  }

  if (hasGemini) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: geminiSchema,
        },
      });
      const rawText = (response.text ?? "").trim();
      if (!rawText) {
        throw new InsightsError(
          502,
          "The AI could not analyse this history. Please try again.",
        );
      }
      const parsed = JSON.parse(rawText) as TradeInsights;
      parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
      return parsed;
    } catch (e) {
      if (e instanceof InsightsError) throw e;
      const msg = e instanceof Error ? e.message : String(e || "");
      if (/429|RESOURCE_EXHAUSTED/i.test(msg)) {
        throw new InsightsError(
          429,
          "AI is busy, please try again in a minute.",
        );
      }
      if (/400|API_KEY_INVALID|403|PERMISSION_DENIED/i.test(msg)) {
        throw new InsightsError(
          403,
          "Gemini API key is invalid or unauthorized. Check GEMINI_API_KEY in Settings > Secrets.",
        );
      }
      if (!lovableKey) {
        throw new InsightsError(502, "AI analysis failed. Please try again.");
      }
    }
  }

  try {
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions: systemPrompt,
      input: [{ role: "user", content: userPrompt }],
      text: {
        format: {
          type: "json_schema",
          name: "trade_insights",
          schema,
          strict: true,
        },
      },
    });
    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") {
        for (const c of item.content)
          if (c.type === "output_text") text += c.text;
      }
    }
    if (!text)
      throw new InsightsError(
        502,
        "The AI could not analyse this history. Please try again.",
      );
    const parsed = JSON.parse(text) as TradeInsights;
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    return parsed;
  } catch (e) {
    if (e instanceof InsightsError) throw e;
    if (e instanceof PaymentRequiredError)
      throw new InsightsError(
        402,
        "AI insights are paused right now. Please try again later.",
      );
    if (e instanceof RateLimitError)
      throw new InsightsError(429, "AI is busy, please try again in a minute.");
    if (e instanceof GatewayError) {
      console.error("AI insights gateway error", e.code, e.ids);
      throw new InsightsError(502, "AI analysis failed. Please try again.");
    }
    throw e;
  }
}
