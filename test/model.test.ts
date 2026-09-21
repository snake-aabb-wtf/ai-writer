import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleClient, ModelResponseTruncatedError } from "../src/model/openai.js";
import type { Config } from "../src/config.js";

const config: Config = {
  port: 4317,
  dataDir: "./data",
  openaiBaseUrl: "https://model.test/v1",
  openaiApiKey: "test-key",
  openaiModel: "test-model",
  basicAuthUsername: "",
  basicAuthPassword: "",
};

describe("OpenAI 兼容模型客户端", () => {
  it("把 finish_reason=length 识别为明确的截断错误，并发送调用方指定的预算", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: { max_tokens?: number } | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as { max_tokens?: number };
      return new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{\"body\":\"半截" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      await assert.rejects(
        () => new OpenAICompatibleClient(config).chat([{ role: "user", content: "test" }], { maxTokens: 24_000 }),
        (error: unknown) => error instanceof ModelResponseTruncatedError
          && error.finishReason === "length"
          && error.message.includes("被截断"),
      );
      assert.equal(requestBody?.max_tokens, 24_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("保留正常 stop 响应的正文", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    try {
      const result = await new OpenAICompatibleClient(config).chat([{ role: "user", content: "test" }]);
      assert.equal(result, "{\"ok\":true}");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
