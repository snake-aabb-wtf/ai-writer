import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 4 WebUI build", () => {
  it("生产产物包含 React 根节点、入口脚本和样式资源", () => {
    const publicDir = join(process.cwd(), "public");
    const html = readFileSync(join(publicDir, "index.html"), "utf8");
    assert.match(html, /id="root"/);
    assert.match(html, /src="\/app\.js"/);
    assert.ok(existsSync(join(publicDir, "app.js")));
    assert.ok(readdirSync(join(publicDir, "assets")).some((file) => file.endsWith(".css")));
  });
});
