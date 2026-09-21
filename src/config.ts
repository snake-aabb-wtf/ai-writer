import "node:process";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type Config = {
  port: number;
  dataDir: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  basicAuthUsername: string;
  basicAuthPassword: string;
};

export type ModelSettings = {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
};

export type UpdateModelSettings = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4317),
    dataDir: env.DATA_DIR ?? "./data",
    openaiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiApiKey: env.OPENAI_API_KEY ?? "",
    openaiModel: env.OPENAI_MODEL ?? "",
    basicAuthUsername: env.BASIC_AUTH_USERNAME ?? "",
    basicAuthPassword: env.BASIC_AUTH_PASSWORD ?? "",
  };
}

function envValue(value: string): string { return JSON.stringify(value); }

function replaceEnvValue(content: string, key: string, value: string): string {
  const expression = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=).*?$`, "m");
  const nextLine = `$1${envValue(value)}`;
  if (expression.test(content)) return content.replace(expression, nextLine);
  const ending = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${ending}${key}=${envValue(value)}\n`;
}

function hasEnvValue(content: string, key: string): boolean {
  const match = content.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`, "m"));
  if (!match) return false;
  const value = (match[1] ?? "").trim();
  return value !== "" && value !== '""' && value !== "''";
}

export function validateModelSettings(input: UpdateModelSettings): { baseUrl: string; model: string; apiKey?: string; clearApiKey: boolean } {
  if (input.apiKey !== undefined && typeof input.apiKey !== "string") throw new Error("API Key 必须是文本");
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") throw new Error("清除密钥选项无效");
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
  if (!baseUrl || baseUrl.length > 1024) throw new Error("接口地址不能为空，且不能超过 1024 个字符");
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error("接口地址必须是有效的 HTTP 或 HTTPS 地址"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("接口地址必须使用 HTTP 或 HTTPS");
  if (!model || model.length > 256) throw new Error("模型 ID 不能为空，且不能超过 256 个字符");
  if (apiKey && apiKey.length > 4096) throw new Error("API Key 不能超过 4096 个字符");
  if (input.clearApiKey && apiKey) throw new Error("不能同时填写 API Key 和清除密钥");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey: apiKey || undefined, clearApiKey: input.clearApiKey === true };
}

/** Updates only model keys, retaining other settings and comments in .env. */
export async function saveModelSettings(input: UpdateModelSettings, envPath = join(process.cwd(), ".env")): Promise<ModelSettings> {
  const next = validateModelSettings(input);
  let content = "";
  try { content = await readFile(envPath, "utf8"); }
  catch (error: unknown) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const existingKeyConfigured = hasEnvValue(content, "OPENAI_API_KEY");
  content = replaceEnvValue(content, "OPENAI_BASE_URL", next.baseUrl);
  content = replaceEnvValue(content, "OPENAI_MODEL", next.model);
  if (next.apiKey !== undefined) content = replaceEnvValue(content, "OPENAI_API_KEY", next.apiKey);
  if (next.clearApiKey) content = replaceEnvValue(content, "OPENAI_API_KEY", "");
  const temporaryPath = join(dirname(envPath), `.${basename(envPath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, envPath);
  await chmod(envPath, 0o600);
  return { baseUrl: next.baseUrl, model: next.model, apiKeyConfigured: next.apiKey !== undefined ? Boolean(next.apiKey) : next.clearApiKey ? false : existingKeyConfigured };
}
