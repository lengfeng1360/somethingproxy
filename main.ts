// main.ts

const TARGET_URL = "https://lengfeng1360-newapi.hf.space";

export async function handler(req: Request): Promise<Response> {
  try {
    // 1. 构建目标URL
    const url = new URL(req.url);
    const targetUrl = new URL(TARGET_URL);
    
    // 将请求路径和查询参数附加到目标URL
    targetUrl.pathname = url.pathname;
    targetUrl.search = url.search;

    // 2. 准备请求头，过滤掉hop-by-hop头和host头
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      // 过滤掉一些不应转发的头信息
      if (!["host", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // 3. 发起代理请求
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: req.body, // 直接传递请求体，支持流式传输
      // @ts-ignore: Deno Deploy支持redirect选项，但类型定义可能未更新
      redirect: "manual", // 手动处理重定向，避免自动跟随导致循环或丢失头信息
    });

    // 4. 准备响应头，同样过滤掉hop-by-hop头
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"].includes(key.toLowerCase())) {
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
      headers: { "Content-Type": "text/plain" }
    });
  }
}

// 启动服务器，仅在作为主模块运行时启动（避免测试时自动启动服务）
if (import.meta.main) {
  console.log("Reverse proxy running on Deno Deploy");
  Deno.serve(handler);
}

