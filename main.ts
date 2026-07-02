// main.ts

// 固定代理目标（根路径及其他非 /proxy/ 路径会转发到此地址，保持向后兼容）
const TARGET_URL = "https://lengfeng1360-newapi.hf.space";

// 不应转发的 hop-by-hop 头部
const HOP_BY_HOP_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
];

/**
 * 通用代理转发函数：将请求转发到指定的目标 URL。
 * 保留流式传输、hop-by-hop 头过滤、手动重定向与错误处理。
 */
async function proxyTo(targetUrl: string, req: Request): Promise<Response> {
  try {
    // 1. 校验目标 URL
    let target: URL;
    try {
      target = new URL(targetUrl);
    } catch {
      return new Response(`Invalid target URL: ${targetUrl}`, {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 仅允许 http/https 协议，防止 file:// 等协议被滥用
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return new Response(`Unsupported protocol: ${target.protocol}`, {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. 准备请求头，过滤掉 hop-by-hop 头和 host 头
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // 3. 发起代理请求
    const response = await fetch(target.toString(), {
      method: req.method,
      headers: headers,
      body: req.body, // 直接传递请求体，支持流式传输
      // @ts-ignore: Deno Deploy 支持 redirect 选项，但类型定义可能未更新
      redirect: "manual", // 手动处理重定向，避免自动跟随导致循环或丢失头信息
    });

    // 4. 准备响应头，同样过滤掉 hop-by-hop 头
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // 5. 返回响应，直接传递响应体流
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    console.error("Proxy error:", error);
    // 根据错误类型返回更合适的错误信息
    const status = error instanceof Deno.errors.NotFound ? 502 : 500;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Proxy Error: ${message}`, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * 解析 /proxy/ 前缀后的目标 URL。
 * /proxy/https://example.com/path?q=1 -> https://example.com/path?q=1
 */
function parseProxyTarget(url: URL): string | null {
  // pathname 形如 /proxy/https://example.com/path
  // slice 后得到 https://example.com/path
  const rawTarget = decodeURIComponent(url.pathname.slice("/proxy/".length));
  if (!rawTarget) {
    return null;
  }
  // 附加原始请求的查询参数
  return rawTarget + url.search;
}

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 动态代理：/proxy/目标URL
  if (url.pathname.startsWith("/proxy/")) {
    const targetUrl = parseProxyTarget(url);
    if (!targetUrl) {
      return new Response(
        "Missing target URL. Usage: /proxy/https://example.com/path",
        {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    return proxyTo(targetUrl, req);
  }

  // 固定代理：根路径及其他路径转发到 TARGET_URL（向后兼容）
  const targetUrl = new URL(TARGET_URL);
  targetUrl.pathname = url.pathname;
  targetUrl.search = url.search;
  return proxyTo(targetUrl.toString(), req);
}

// 启动服务器，仅在作为主模块运行时启动（避免测试时自动启动服务）
if (import.meta.main) {
  console.log("Reverse proxy running on Deno Deploy");
  console.log(`  - Fixed proxy target: ${TARGET_URL}`);
  console.log("  - Dynamic proxy: /proxy/<target-url>");
  Deno.serve(handler);
}
