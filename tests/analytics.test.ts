import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/analytics/handler.ts";
import {
  validateEvent,
  allowedOrigins,
} from "../supabase/functions/analytics/validation";
import { privacyEnabled } from "../src/lib/analytics";
const event = {
  event_id: "00000000-0000-4000-8000-000000000001",
  session_id: "00000000-0000-4000-8000-000000000002",
  event: "page_view",
  path: "/",
};
const config = {
  url: "https://example.supabase.co",
  serviceKey: "test-server-placeholder",
  origins: "https://anshuls235.github.io,http://127.0.0.1:4173",
};
const request = (
  body: unknown = event,
  origin = "https://anshuls235.github.io",
  headers: Record<string, string> = {},
) =>
  new Request("https://example.supabase.co/functions/v1/analytics", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
test("DNT and GPC opt out", () => {
  assert.equal(privacyEnabled({ doNotTrack: "1" }), true);
  assert.equal(
    privacyEnabled({ doNotTrack: null, globalPrivacyControl: true }),
    true,
  );
  assert.equal(privacyEnabled({ doNotTrack: "0" }), false);
});
test("origins cannot be wildcarded or spoofed with suffixes or paths", () => {
  assert.throws(() => allowedOrigins("*"));
  assert.throws(() => allowedOrigins("https://example.com/"));
  assert.throws(() => allowedOrigins("http://example.com"));
  assert.equal(allowedOrigins(config.origins).size, 2);
});
test("strict event validation strips opportunities for personal data", () => {
  assert.deepEqual(validateEvent(event), event);
  for (const input of [
    { ...event, ip: "1.2.3.4" },
    { ...event, path: "/?email=private@example.com" },
    { ...event, path: "/../secret" },
    { ...event, event: "arbitrary" },
    { ...event, referrer: "https://host.com/path" },
    { ...event, utm: { utm_campaign: "private@example.com" } },
    { ...event, event: "project_link" },
  ])
    assert.throws(() => validateEvent(input));
});
test("Edge accepts minimal events and uses only the server credential", async () => {
  let calls = 0;
  const handler = createHandler(config, async (input, init) => {
    calls++;
    assert.equal(String(input), config.url + "/rest/v1/rpc/ingest_analytics");
    assert.equal(
      (init?.headers as Record<string, string>).apikey,
      config.serviceKey,
    );
    assert.deepEqual(JSON.parse(String(init?.body)), { p_event: event });
    return new Response("true");
  });
  const response = await handler(request());
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://anshuls235.github.io",
  );
  assert.equal(calls, 1);
});
test("Edge rejects disallowed origins and malformed, oversized and unexpected input before database access", async () => {
  let calls = 0;
  const handler = createHandler(config, async () => {
    calls++;
    return new Response("true");
  });
  assert.equal(
    (await handler(request(event, "https://anshuls235.github.io.evil.com")))
      .status,
    403,
  );
  assert.equal((await handler(request({ ...event, email: "x" }))).status, 400);
  assert.equal(
    (await handler(request({ data: "x".repeat(3000) }))).status,
    413,
  );
  assert.equal(
    (await handler(request(event, undefined, { "Content-Type": "text/plain" })))
      .status,
    415,
  );
  assert.equal(
    (await handler(request(event, undefined, { DNT: "1" }))).status,
    204,
  );
  assert.equal(calls, 0);
});
test("Edge responds to preflight; quotas and upstream failure remain non-blocking", async () => {
  const handler = createHandler(config, async () => new Response("false"));
  assert.equal(
    (
      await handler(
        new Request(config.url, {
          method: "OPTIONS",
          headers: { Origin: "https://anshuls235.github.io" },
        }),
      )
    ).status,
    204,
  );
  assert.equal((await handler(request())).status, 429);
  assert.equal(
    (
      await createHandler(config, async () => {
        throw new Error("private database detail");
      })(request())
    ).status,
    503,
  );
});
