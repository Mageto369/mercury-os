import { expect, test } from "@playwright/test";
import { integrationCatalog } from "@/lib/admin/catalog";
import {
  chatCompletionPayload,
  extractChatCompletionText,
  llmProviderDefaults,
  llmProviders,
  openAiCompatibleChatEndpoint,
} from "@/lib/llm/router";

test("DeepSeek and Kimi K2 have complete provider contracts", () => {
  expect(llmProviders).toContain("deepseek");
  expect(llmProviders).toContain("kimi");
  expect(llmProviderDefaults.deepseek).toBe("https://api.deepseek.com");
  expect(llmProviderDefaults.kimi).toBe("https://api.moonshot.ai/v1");
  expect(openAiCompatibleChatEndpoint("deepseek")).toBe(
    "https://api.deepseek.com/chat/completions",
  );
  expect(openAiCompatibleChatEndpoint("kimi")).toBe(
    "https://api.moonshot.ai/v1/chat/completions",
  );
  expect(openAiCompatibleChatEndpoint("kimi", "https://example.test/v1/")).toBe(
    "https://example.test/v1/chat/completions",
  );

  const deepseek = integrationCatalog.find((item) => item.id === "deepseek");
  const kimi = integrationCatalog.find((item) => item.id === "kimi");
  expect(deepseek?.defaultModel).toBe("deepseek-v4-pro");
  expect(kimi?.defaultModel).toBe("kimi-k2.6");
});

test("OpenAI-compatible request and response mapping preserves the research prompt", () => {
  const payload = chatCompletionPayload(
    "kimi-k2.6",
    "Analyze ABC",
    "Research only",
    900,
  );
  expect(payload).toEqual({
    model: "kimi-k2.6",
    messages: [
      { role: "system", content: "Research only" },
      { role: "user", content: "Analyze ABC" },
    ],
    max_tokens: 900,
    stream: false,
  });
  expect(
    extractChatCompletionText({
      choices: [{ message: { content: "Evidence first." } }],
    }),
  ).toBe("Evidence first.");
  expect(extractChatCompletionText({ choices: [] })).toBe("");
});

test("research copilot accepts both new provider identifiers", async ({ request }) => {
  for (const provider of ["deepseek", "kimi"]) {
    const response = await request.post("/api/research/copilot", {
      data: {
        symbol: "TEST",
        question: "Analyze evidence",
        mode: "copilot",
        provider,
      },
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toBe("database_not_configured");
  }

  const invalid = await request.post("/api/research/copilot", {
    data: {
      symbol: "TEST",
      question: "Analyze evidence",
      mode: "copilot",
      provider: "unknown-provider",
    },
  });
  expect(invalid.status()).toBe(400);
});

test("AI workspace exposes DeepSeek and Kimi K2 choices", async ({ page }) => {
  await page.goto("/ai");
  const selector = page.getByLabel("Provider");
  await expect(selector.locator('option[value="deepseek"]')).toHaveText("DeepSeek");
  await expect(selector.locator('option[value="kimi"]')).toHaveText("Kimi K2");
});
