import test from "node:test";
import assert from "node:assert/strict";
import {
  redactExternalRequestFields,
  readExternalMedia,
  validateExternalCallbackUrl,
  validateExternalMediaUrl,
} from "./safe-external-media.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("client task redaction removes callback tokens but keeps playable output", () => {
  const safe = redactExternalRequestFields({
    id: "task-1",
    callbackUrl: "https://studio.example.test/callback?token=secret",
    providerRequestUrl: "https://provider.example.test/request?key=secret",
    targetUrl: "https://internal.example.test/target",
    videoUrl: "https://cdn.example.test/result.mp4",
  });
  assert.deepEqual(safe, {
    id: "task-1",
    videoUrl: "https://cdn.example.test/result.mp4",
  });
});

test("external media URL only accepts HTTP(S) public addresses", async () => {
  await assert.rejects(
    validateExternalMediaUrl("file:///etc/passwd", { lookup: publicLookup }),
    { code: "EXTERNAL_MEDIA_URL_REJECTED", status: 400 },
  );
  await assert.rejects(
    validateExternalMediaUrl("http://127.0.0.1/admin", {
      lookup: publicLookup,
    }),
    { code: "EXTERNAL_MEDIA_URL_REJECTED", status: 400 },
  );
  await assert.rejects(
    validateExternalMediaUrl("https://media.example.test/output.png", {
      lookup: async () => [{ address: "10.0.0.8", family: 4 }],
    }),
    { code: "EXTERNAL_MEDIA_URL_REJECTED", status: 400 },
  );

  const accepted = await validateExternalMediaUrl(
    "https://media.example.test/output.png#ignored",
    { lookup: publicLookup },
  );
  assert.equal(accepted.url.href, "https://media.example.test/output.png");
  assert.equal(accepted.addresses[0].address, "93.184.216.34");
});

test("DNS lookup failures are retryable and never expose the hostname", async () => {
  await assert.rejects(
    validateExternalMediaUrl("https://secret-origin.example.test/output.png", {
      lookup: async () => {
        throw new Error("getaddrinfo secret-origin.example.test ENOTFOUND");
      },
    }),
    (error) => {
      assert.equal(error.code, "EXTERNAL_MEDIA_DNS_FAILED");
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /secret-origin|example\.test|ENOTFOUND/i);
      return true;
    },
  );
});

test("configured PUBLIC_BASE_URL media is allowed but only on known media paths", async () => {
  const publicBaseUrl = "https://studio.example.test";
  const ownMedia = await validateExternalMediaUrl(
    "https://studio.example.test/generated/task.png?exp=1&sig=ok",
    {
      publicBaseUrl,
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    },
  );
  assert.equal(ownMedia.sameSite, true);

  await assert.rejects(
    validateExternalMediaUrl(
      "https://studio.example.test/api/admin/status",
      {
        publicBaseUrl,
        lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      },
    ),
    { code: "EXTERNAL_MEDIA_URL_REJECTED" },
  );
  await assert.rejects(
    validateExternalMediaUrl(
      "https://studio.example.test/generated/%2e%2e%2fapi/admin/status",
      {
        publicBaseUrl,
        lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      },
    ),
    { code: "EXTERNAL_MEDIA_URL_REJECTED" },
  );
});

test("one private DNS answer or an IPv6 local address rejects the whole target", async () => {
  await assert.rejects(
    validateExternalMediaUrl("https://mixed.example.test/output.png", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.4", family: 4 },
      ],
    }),
    { code: "EXTERNAL_MEDIA_URL_REJECTED" },
  );
  for (const url of [
    "http://[::1]/secret",
    "http://[fc00::1]/secret",
    "http://[::ffff:127.0.0.1]/secret",
    "http://[64:ff9b::7f00:1]/secret",
    "http://[2002:7f00:1::]/secret",
    "http://[2001:db8::1]/secret",
  ]) {
    await assert.rejects(validateExternalMediaUrl(url), {
      code: "EXTERNAL_MEDIA_URL_REJECTED",
    });
  }
});

test("callback URLs require HTTPS public DNS or the configured provider callback", async () => {
  await assert.rejects(
    validateExternalCallbackUrl("http://hooks.example.test/task", {
      lookup: publicLookup,
    }),
    { code: "EXTERNAL_CALLBACK_URL_REJECTED", status: 400 },
  );
  await assert.rejects(
    validateExternalCallbackUrl("https://hooks.example.test/task", {
      lookup: async () => [{ address: "169.254.169.254", family: 4 }],
    }),
    { code: "EXTERNAL_CALLBACK_URL_REJECTED", status: 400 },
  );

  const configured = await validateExternalCallbackUrl(
    "https://studio.example.test/api/providers/volcengine/callback/task?token=secret",
    {
      publicBaseUrl: "https://studio.example.test",
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    },
  );
  assert.equal(configured.origin, "https://studio.example.test");
});

const streamBody = (...chunks) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) yield Buffer.from(chunk);
  },
});

test("external media reader rejects oversized headers and oversized streams", async () => {
  await assert.rejects(
    readExternalMedia("https://media.example.test/large.png", {
      lookup: publicLookup,
      maxBytes: 4,
      requestImpl: async () => ({
        status: 200,
        headers: new Map([
          ["content-length", "5"],
          ["content-type", "image/png"],
        ]),
        body: streamBody("abcde"),
      }),
    }),
    { code: "EXTERNAL_MEDIA_TOO_LARGE", status: 413 },
  );

  await assert.rejects(
    readExternalMedia("https://media.example.test/chunked.png", {
      lookup: publicLookup,
      maxBytes: 4,
      requestImpl: async () => ({
        status: 200,
        headers: new Map([["content-type", "image/png"]]),
        body: streamBody("abc", "de"),
      }),
    }),
    { code: "EXTERNAL_MEDIA_TOO_LARGE", status: 413 },
  );
});

test("external media reader validates every redirect target", async () => {
  let calls = 0;
  await assert.rejects(
    readExternalMedia("https://media.example.test/start", {
      lookup: publicLookup,
      requestImpl: async () => {
        calls += 1;
        return {
          status: 302,
          headers: new Map([["location", "http://127.0.0.1/metadata"]]),
          body: streamBody(),
        };
      },
    }),
    { code: "EXTERNAL_MEDIA_URL_REJECTED", status: 400 },
  );
  assert.equal(calls, 1);
});

test("external media reader times out without exposing the target or cause", async () => {
  await assert.rejects(
    readExternalMedia("https://secret-token.example.test/media", {
      lookup: publicLookup,
      timeoutMs: 5,
      requestImpl: async ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("secret-token.example.test"), { name: "AbortError" })),
            { once: true },
          );
        }),
    }),
    (error) => {
      assert.equal(error.code, "EXTERNAL_MEDIA_TIMEOUT");
      assert.equal(error.status, 504);
      assert.doesNotMatch(error.message, /secret-token|example\.test/i);
      return true;
    },
  );
});

test("external media reader returns a bounded buffer and pins a validated address", async () => {
  const result = await readExternalMedia(
    "https://media.example.test/output.png",
    {
      lookup: publicLookup,
      maxBytes: 16,
      requestImpl: async ({ address, family }) => {
        assert.equal(address, "93.184.216.34");
        assert.equal(family, 4);
        return {
          status: 200,
          headers: new Map([["content-type", "image/png; charset=binary"]]),
          body: streamBody("image"),
        };
      },
    },
  );
  assert.equal(result.buffer.toString(), "image");
  assert.equal(result.contentType, "image/png");
});

