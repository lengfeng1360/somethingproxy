import { assertEquals, assertStringIncludes } from "@std/assert";
import { handler, rewriteStaticPaths } from "./main.ts";

// ===== 动态代理 /proxy/ =====

Deno.test("dynamic proxy: forwards to specified target URL", async () => {
  // 使用 httpbin 的 /get 端点验证转发与查询参数保留
  const res = await handler(
    new Request(
      "http://localhost/proxy/https://httpbin.org/get?foo=bar",
    ),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  // httpbin /get 会回显请求信息，验证 url 字段包含目标地址
  assertEquals(data.url, "https://httpbin.org/get?foo=bar");
});

Deno.test("dynamic proxy: preserves POST body and headers", async () => {
  const res = await handler(
    new Request("http://localhost/proxy/https://httpbin.org/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.json, { hello: "world" });
});

Deno.test("dynamic proxy: missing target URL returns 400", async () => {
  const res = await handler(new Request("http://localhost/proxy/"));
  assertEquals(res.status, 400);
  const text = await res.text();
  assertEquals(text.includes("Missing target URL"), true);
});

Deno.test("dynamic proxy: invalid target URL returns 400", async () => {
  const res = await handler(
    new Request("http://localhost/proxy/not-a-valid-url"),
  );
  assertEquals(res.status, 400);
  const text = await res.text();
  assertEquals(text.includes("Invalid target URL"), true);
});

Deno.test("dynamic proxy: unsupported protocol returns 400", async () => {
  const res = await handler(
    new Request("http://localhost/proxy/file:///etc/passwd"),
  );
  assertEquals(res.status, 400);
  const text = await res.text();
  assertEquals(text.includes("Unsupported protocol"), true);
});

Deno.test("dynamic proxy: handles encoded target URL", async () => {
  // 目标 URL 经过编码的情况
  const encoded = encodeURIComponent("https://httpbin.org/get");
  const res = await handler(
    new Request(`http://localhost/proxy/${encoded}`),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.url, "https://httpbin.org/get");
});

// ===== HTML内容重写 =====

Deno.test("rewriteStaticPaths: rewrites script src attributes", async () => {
  const html = `<html><body><script src="/assets/test.js"></script></body></html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `src="/proxy/https://example.com/assets/test.js"`);
});

Deno.test("rewriteStaticPaths: rewrites link href attributes", async () => {
  const html = `<html><head><link rel="stylesheet" href="/assets/test.css"></head></html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `href="/proxy/https://example.com/assets/test.css"`);
});

Deno.test("rewriteStaticPaths: rewrites img src attributes", async () => {
  const html = `<html><body><img src="/images/test.jpg"></body></html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `src="/proxy/https://example.com/images/test.jpg"`);
});

Deno.test("rewriteStaticPaths: rewrites CSS url() references", async () => {
  const html = `<html><head><style>body { background: url('/bg.png'); }</style></head></html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `url("/proxy/https://example.com/bg.png")`);
});

Deno.test("rewriteStaticPaths: handles multiple attributes", async () => {
  const html = `<html>
    <script src="/assets/test.js"></script>
    <link rel="stylesheet" href="/assets/test.css">
    <img src="/images/test.jpg">
  </html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `src="/proxy/https://example.com/assets/test.js"`);
  assertStringIncludes(rewritten, `href="/proxy/https://example.com/assets/test.css"`);
  assertStringIncludes(rewritten, `src="/proxy/https://example.com/images/test.jpg"`);
});

Deno.test("rewriteStaticPaths: preserves absolute URLs", async () => {
  const html = `<html><body><script src="https://cdn.example.com/test.js"></script></body></html>`;
  const rewritten = await rewriteStaticPaths(html, "/proxy/https://example.com");
  assertStringIncludes(rewritten, `src="https://cdn.example.com/test.js"`);
});

Deno.test("rewriteStaticPaths: handles malformed proxy prefix", async () => {
  const html = `<html><body><script src="/assets/test.js"></script></body></html>`;
  const rewritten = await rewriteStaticPaths(html, "/invalid-prefix");
  assertEquals(rewritten, html);
});