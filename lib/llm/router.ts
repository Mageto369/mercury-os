import {
  getRuntimeIntegration,
  resolveIntegrationToken,
  type RuntimeIntegration,
} from "@/lib/admin/integration-runtime";

export type LlmProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "kimi";

export type LlmRequest = {
  prompt: string;
  system?: string;
  provider?: LlmProvider;
  maxOutputTokens?: number;
};

export type LlmResult = {
  provider: LlmProvider;
  model: string;
  text: string;
  usage?: unknown;
  researchOnly: true;
  capitalExecutionEnabled: false;
};

export const llmProviders: readonly LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "kimi",
];

export const llmProviderDefaults: Record<LlmProvider, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.ai/v1",
};

const credentialEnvironments: Record<LlmProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  kimi: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
};

async function configured(provider: LlmProvider) {
  const config = await getRuntimeIntegration(provider);
  return config?.enabled && config.model ? config : null;
}

export async function selectLlmProvider(preferred?: LlmProvider) {
  if (preferred) {
    const config = await configured(preferred);
    if (config) return { provider: preferred, config };
  }
  for (const provider of llmProviders) {
    const config = await configured(provider);
    if (config) return { provider, config };
  }
  return null;
}

async function configuredCandidates(preferred?: LlmProvider) {
  const candidates = preferred ? [preferred] : llmProviders;
  const result: Array<{ provider: LlmProvider; config: RuntimeIntegration }> = [];
  for (const provider of candidates) {
    const config = await configured(provider);
    if (config) result.push({ provider, config });
  }
  return result;
}

async function fetchJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("llm_response_too_large");
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("llm_invalid_json");
    }
    if (!response.ok) {
      const detail = String(
        body?.error?.message ?? body?.message ?? "provider_error",
      ).slice(0, 300);
      throw new Error(`llm_http_${response.status}:${detail}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function extractChatCompletionText(body: any) {
  return Array.isArray(body?.choices)
    ? body.choices
        .map((choice: any) => choice?.message?.content ?? "")
        .join("\n")
        .trim()
    : "";
}

export function chatCompletionPayload(
  model: string,
  prompt: string,
  system: string | undefined,
  maxOutputTokens: number,
) {
  return {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system.slice(0, 12_000) }] : []),
      { role: "user", content: prompt },
    ],
    max_tokens: maxOutputTokens,
    stream: false,
  };
}

export function openAiCompatibleChatEndpoint(
  provider: "deepseek" | "kimi",
  baseUrl?: string | null,
) {
  const base = (baseUrl || llmProviderDefaults[provider]).replace(/\/$/, "");
  return `${base}/chat/completions`;
}

async function runProvider(
  provider: LlmProvider,
  config: RuntimeIntegration,
  prompt: string,
  system: string | undefined,
  maxOutputTokens: number,
): Promise<LlmResult> {
  const model = String(config.model);
  const base = (config.baseUrl || llmProviderDefaults[provider]).replace(/\/$/, "");
  const token = await resolveIntegrationToken(
    provider,
    credentialEnvironments[provider],
    "api_key",
  );
  if (!token) throw new Error(`${provider}_credential_missing`);

  if (provider === "openai") {
    const body = await fetchJson(`${base}/v1/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          ...(system ? [{ role: "system", content: system.slice(0, 12_000) }] : []),
          { role: "user", content: prompt },
        ],
        max_output_tokens: maxOutputTokens,
      }),
    });
    const text = String(
      body.output_text ??
        (Array.isArray(body.output)
          ? body.output.flatMap((output: any) => output.content ?? []).map((content: any) => content.text ?? "").join("")
          : ""),
    ).trim();
    if (!text) throw new Error("llm_empty_response");
    return { provider, model, text, usage: body.usage, researchOnly: true, capitalExecutionEnabled: false };
  }

  if (provider === "anthropic") {
    const body = await fetchJson(`${base}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": token, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxOutputTokens, system: system?.slice(0, 12_000), messages: [{ role: "user", content: prompt }] }),
    });
    const text = Array.isArray(body.content)
      ? body.content.filter((content: any) => content.type === "text").map((content: any) => content.text).join("\n").trim()
      : "";
    if (!text) throw new Error("llm_empty_response");
    return { provider, model, text, usage: body.usage, researchOnly: true, capitalExecutionEnabled: false };
  }

  if (provider === "gemini") {
    const body = await fetchJson(
      `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system.slice(0, 12_000) }] } : undefined,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens },
        }),
      },
    );
    const text = Array.isArray(body.candidates)
      ? body.candidates.flatMap((candidate: any) => candidate.content?.parts ?? []).map((part: any) => part.text ?? "").join("\n").trim()
      : "";
    if (!text) throw new Error("llm_empty_response");
    return { provider, model, text, usage: body.usageMetadata, researchOnly: true, capitalExecutionEnabled: false };
  }

  const body = await fetchJson(
    openAiCompatibleChatEndpoint(provider, config.baseUrl),
    {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(chatCompletionPayload(model, prompt, system, maxOutputTokens)),
    },
  );
  const text = extractChatCompletionText(body);
  if (!text) throw new Error("llm_empty_response");
  return { provider, model, text, usage: body.usage, researchOnly: true, capitalExecutionEnabled: false };
}

export async function runLlm(request: LlmRequest): Promise<LlmResult> {
  const prompt = request.prompt.trim().slice(0, 30_000);
  if (!prompt) throw new Error("empty_prompt");
  const maxOutputTokens = Math.max(64, Math.min(4_000, request.maxOutputTokens ?? 1_200));
  const candidates = await configuredCandidates(request.provider);
  if (!candidates.length) throw new Error("no_enabled_llm_provider");

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return await runProvider(candidate.provider, candidate.config, prompt, request.system, maxOutputTokens);
    } catch (error) {
      failures.push(`${candidate.provider}:${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
  throw new Error(`all_enabled_llm_providers_failed:${failures.join("|")}`);
}
