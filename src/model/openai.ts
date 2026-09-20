import type { Config } from "../config.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class ModelResponseTruncatedError extends Error {
  constructor(readonly finishReason: string, readonly partialContent?: string) {
    super(`模型响应被截断（finish_reason=${finishReason}）；请重试或减少本次生成内容`);
    this.name = "ModelResponseTruncatedError";
  }
}

export class OpenAICompatibleClient {
  constructor(private readonly config: Config) {}

  get configured(): boolean {
    return Boolean(this.config.openaiBaseUrl && this.config.openaiApiKey && this.config.openaiModel);
  }

  async chat(messages: ChatMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    if (!this.configured) throw new Error("模型未配置：请填写 OPENAI_BASE_URL、OPENAI_API_KEY 和 OPENAI_MODEL");
    const response = await fetch(`${this.config.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.openaiApiKey}` },
      body: JSON.stringify({
        model: this.config.openaiModel,
        messages,
        temperature: options.temperature ?? 0.8,
        max_tokens: options.maxTokens ?? 4000,
      }),
    });
    if (!response.ok) throw new Error(`模型请求失败（${response.status}）：${await response.text()}`);
    const payload = await response.json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length" || choice?.finish_reason === "max_tokens") {
      throw new ModelResponseTruncatedError(choice.finish_reason, choice.message?.content);
    }
    const content = choice?.message?.content;
    if (!content) throw new Error("模型响应缺少 choices[0].message.content");
    return content;
  }
}
