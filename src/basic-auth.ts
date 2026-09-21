import { timingSafeEqual } from "node:crypto";

export type BasicAuthConfig = {
  basicAuthUsername: string;
  basicAuthPassword: string;
};

export function basicAuthEnabled(config: BasicAuthConfig): boolean {
  return Boolean(config.basicAuthUsername && config.basicAuthPassword);
}

export function basicAuthMatches(authorization: string | undefined, config: BasicAuthConfig): boolean {
  if (!basicAuthEnabled(config)) return true;
  if (!authorization?.startsWith("Basic ")) return false;
  const encoded = authorization.slice("Basic ".length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const actual = Buffer.from(encoded, "base64");
  const expected = Buffer.from(`${config.basicAuthUsername}:${config.basicAuthPassword}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
