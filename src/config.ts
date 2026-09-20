import "node:process";

export type Config = {
  port: number;
  dataDir: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4317),
    dataDir: env.DATA_DIR ?? "./data",
    openaiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiApiKey: env.OPENAI_API_KEY ?? "",
    openaiModel: env.OPENAI_MODEL ?? "",
  };
}
