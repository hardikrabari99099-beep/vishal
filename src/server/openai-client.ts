import fs from "node:fs";
import path from "node:path";

export class OpenAiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAiContentPart[];
};

export function readOpenAiApiKey(): string {
  const direct = String(process.env["OPENAI_API_KEY"] || "").trim();
  if (direct && !/^MY_/i.test(direct)) return direct;
  if (!process.env["VITEST"]) {
    for (const fileName of [".env", ".env.local"]) {
      try {
        const p = path.resolve(process.cwd(), fileName);
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq <= 0) continue;
          const k = trimmed.slice(0, eq).trim();
          if (k !== "OPENAI_API_KEY") continue;
          let v = trimmed.slice(eq + 1).trim();
          if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
          ) {
            v = v.slice(1, -1).trim();
          }
          if (v && !/^MY_/i.test(v)) return v;
        }
      } catch {
        // ignore unreadable env file
      }
    }
  }
  return "";
}

export function getOpenAiModel(): string {
  return String(process.env["OPENAI_MODEL"] || "").trim() || "gpt-4o-mini";
}

export async function callOpenAiChat(options: {
  apiKey?: string;
  model?: string;
  messages: OpenAiChatMessage[];
  responseFormat?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      };
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<string> {
  const apiKey = String(options.apiKey ?? readOpenAiApiKey()).trim();
  if (!apiKey) {
    throw new OpenAiClientError(
      503,
      "OPENAI_API_KEY is not configured. Add it in Settings > Secrets.",
    );
  }

  const model = options.model || getOpenAiModel();
  const maxRetries = options.maxRetries ?? 1;
  const timeoutMs = options.timeoutMs ?? 45000;

  const payload: Record<string, unknown> = {
    model,
    messages: options.messages,
  };
  if (options.responseFormat) {
    payload["response_format"] = options.responseFormat;
  }
  if (typeof options.temperature === "number") {
    payload["temperature"] = options.temperature;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp: Response;
    try {
      resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || "");
      const isTimeout =
        (err instanceof Error && err.name === "TimeoutError") ||
        /timeout|aborted/i.test(msg);
      if (attempt < maxRetries && isTimeout) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      if (isTimeout) {
        throw new OpenAiClientError(
          504,
          "OpenAI request timed out. Please try again.",
        );
      }
      throw new OpenAiClientError(
        502,
        "Unable to reach OpenAI service. Please try again.",
      );
    }

    if (
      attempt < maxRetries &&
      (resp.status === 500 || resp.status === 502 || resp.status === 503)
    ) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    const rawBody = await resp.text();
    let data: {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string; code?: string; type?: string };
    } | null = null;
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = null;
    }

    if (!resp.ok) {
      const errCode = String(data?.error?.code || "");
      const errMsg = String(data?.error?.message || "");
      if (resp.status === 401 || errCode === "invalid_api_key") {
        throw new OpenAiClientError(
          401,
          "OpenAI API key is invalid or unauthorized. Check OPENAI_API_KEY in Settings > Secrets.",
        );
      }
      if (resp.status === 403) {
        throw new OpenAiClientError(
          403,
          "OpenAI API permission denied. Check OPENAI_API_KEY in Settings > Secrets.",
        );
      }
      if (resp.status === 429) {
        if (errCode === "insufficient_quota" || /quota|billing/i.test(errMsg)) {
          throw new OpenAiClientError(
            402,
            "OpenAI API quota exceeded. Please check your OpenAI billing/credits.",
          );
        }
        throw new OpenAiClientError(
          429,
          "OpenAI rate limit reached. Please wait a minute and retry.",
        );
      }
      if (resp.status >= 500) {
        throw new OpenAiClientError(
          503,
          "OpenAI service is temporarily busy. Please try again in a few seconds.",
        );
      }
      throw new OpenAiClientError(
        resp.status === 400 ? 400 : 502,
        `OpenAI request failed: ${errMsg || `HTTP ${resp.status}`}`.slice(
          0,
          240,
        ),
      );
    }

    const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      throw new OpenAiClientError(
        502,
        "OpenAI returned an empty response. Please try again.",
      );
    }
    return content;
  }

  throw new OpenAiClientError(502, "OpenAI request failed. Please try again.");
}
