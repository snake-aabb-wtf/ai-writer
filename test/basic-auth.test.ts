import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { basicAuthEnabled, basicAuthMatches } from "../src/basic-auth.js";

describe("HTTP Basic Auth", () => {
  const enabled = { basicAuthUsername: "writer", basicAuthPassword: "correct horse battery staple" };

  it("stays disabled until both .env values are present", () => {
    assert.equal(basicAuthEnabled({ basicAuthUsername: "", basicAuthPassword: "password" }), false);
    assert.equal(basicAuthMatches(undefined, { basicAuthUsername: "writer", basicAuthPassword: "" }), true);
  });

  it("accepts only an exact Basic authorization value when enabled", () => {
    const valid = `Basic ${Buffer.from("writer:correct horse battery staple").toString("base64")}`;
    assert.equal(basicAuthMatches(valid, enabled), true);
    assert.equal(basicAuthMatches(undefined, enabled), false);
    assert.equal(basicAuthMatches(`Basic ${Buffer.from("writer:wrong").toString("base64")}`, enabled), false);
    assert.equal(basicAuthMatches("Bearer anything", enabled), false);
  });
});
