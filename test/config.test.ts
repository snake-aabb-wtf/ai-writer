import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { saveModelSettings, validateModelSettings } from "../src/config.js";

describe("model settings .env persistence", () => {
  it("changes only model keys and keeps unrelated values and comments", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ai-writer-config-"));
    const envPath = join(directory, ".env");
    writeFileSync(envPath, "# keep this comment\nPORT=4317\nOPENAI_BASE_URL=https://old.example/v1\nOPENAI_API_KEY=old-key\nOPENAI_MODEL=old-model\nDATA_DIR=./data\n");
    chmodSync(envPath, 0o600);
    const result = await saveModelSettings({ baseUrl: "https://new.example/v1/", model: "new-model", apiKey: "new-key" }, envPath);
    const content = readFileSync(envPath, "utf8");
    assert.deepEqual(result, { baseUrl: "https://new.example/v1", model: "new-model", apiKeyConfigured: true });
    assert.match(content, /# keep this comment/);
    assert.match(content, /PORT=4317/);
    assert.match(content, /DATA_DIR=\.\/data/);
    assert.match(content, /OPENAI_BASE_URL="https:\/\/new\.example\/v1"/);
    assert.match(content, /OPENAI_MODEL="new-model"/);
    assert.match(content, /OPENAI_API_KEY="new-key"/);
    assert.equal(statSync(envPath).mode & 0o777, 0o600);
  });

  it("rejects unsafe or incomplete input before writing", () => {
    assert.throws(() => validateModelSettings({ baseUrl: "file:///tmp/model", model: "x" }), /HTTP 或 HTTPS/);
    assert.throws(() => validateModelSettings({ baseUrl: "https://example.com/v1", model: "", apiKey: "x" }), /模型 ID/);
    assert.throws(() => validateModelSettings({ baseUrl: "https://example.com/v1", model: "x", apiKey: "x", clearApiKey: true }), /不能同时/);
  });

  it("keeps an empty key empty when only the endpoint and model change", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ai-writer-config-"));
    const envPath = join(directory, ".env");
    writeFileSync(envPath, "OPENAI_API_KEY=\n");
    const result = await saveModelSettings({ baseUrl: "https://example.com/v1", model: "test-model" }, envPath);
    assert.equal(result.apiKeyConfigured, false);
  });
});
