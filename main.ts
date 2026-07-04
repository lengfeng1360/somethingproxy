// main.ts

// 固定代理目标（根路径及其他非 /proxy/ 路径会转发到此地址，保持向后兼容）
const TARGET_URL = "https://lengfeng1360-newapi.hf.space";

/**
 * 重写HTML内容中的静态资源路径，将相对路径转换为通过代理服务访问的绝对路径
 * @param html HTML内容
 * @param proxyPrefix 代理前缀（如"/proxy/https://example.com"）
 * @returns 重写后的HTML内容
 */
export async function rewriteHtmlStaticResources(html: string, proxyPrefix: string): Promise<string> {
  // 解析代理前缀中的目标URL
  const targetUrlMatch = proxyPrefix.match(/^\/proxy\/(https?:\/\/[^\/]+)/);
  if (!targetUrlMatch) {
    return html;
  }

  const targetOrigin = targetUrlMatch[1];
  console.log(`Rewriting HTML with proxyPrefix: ${proxyPrefix}`);

  // 处理不同类型的标签和属性
  const tagPatterns = [
    { tag: 'script', attr: 'src' },
    { tag: 'link', attr: 'href' },
    { tag: 'img', attr: 'src' },
    { tag: 'video', attr: 'src' },
    { tag: 'audio', attr: 'src' },
    { tag: 'source', attr: 'src' },
    { tag: 'track', attr: 'src' },
    { tag: 'iframe', attr: 'src' },
    { tag: 'a', attr: 'href' },
    { tag: 'image', attr: 'xlink:href' },
    { tag: 'use', attr: 'xlink:href' },
    { tag: 'input', attr: 'src' },
    { tag: 'picture', attr: 'src' },
    { tag: 'object', attr: 'data' }
  ];

  // 处理每种标签
  for (const { tag, attr } of tagPatterns) {
    // 匹配形如 <tag ... attr="/..." ...> 的标签，attr 既可能是第一个属性也可能不是
    // 使用 [^>]*? 非贪婪匹配属性间内容，attr 前的 \s+ 允许 0+ 个空白
    // 注意：在 new RegExp 字符串中 \s 必须写为 \\s，否则会被解释为字面 's'
    const regex = new RegExp(`<${tag}([^>]*?)\\s+${attr}=["'](\\/[^"']*?)["']`, 'gi');
    html = html.replace(regex, (match, attrs, path) => {
      console.log(`Found ${tag} ${attr}: ${path}`);
      // 跳过已带代理前缀、绝对路径、协议相对路径
      if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
        console.log(`Skipping: ${path}`);
        return match;
      }
      const rewritten = `<${tag}${attrs} ${attr}="${proxyPrefix}${path}"`;
      console.log(`Rewritten to: ${rewritten}`);
      return rewritten;
    });
    // 额外处理 attr 作为标签第一个属性的情况（如 <link href="/..."> ）
    const firstAttrRegex = new RegExp(`<${tag}\\s+${attr}=["'](\\/[^"']*?)["']`, 'gi');
    html = html.replace(firstAttrRegex, (match, path) => {
      // 跳过已带代理前缀、绝对路径、协议相对路径
      if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
        console.log(`Skipping first-attr: ${path}`);
        return match;
      }
      console.log(`Found first-attr ${tag} ${attr}: ${path}`);
      const rewritten = `<${tag} ${attr}="${proxyPrefix}${path}"`;
      console.log(`Rewritten first-attr to: ${rewritten}`);
      return rewritten;
    });
  }

  // 处理CSS中的url()引用
  html = html.replace(/url\(["']?(\/[^"')]+)["']?\)/gi, (match, path) => {
    console.log(`Found CSS url: ${path}`);
    // 跳过已带代理前缀、绝对路径、协议相对路径
    if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      console.log(`Skipping CSS path: ${path}`);
      return match;
    }
    const rewritten = `url("${proxyPrefix}${path}")`;
    console.log(`Rewritten CSS to: ${rewritten}`);
    return rewritten;
  });

  // 处理data-main属性（AMD加载器）
  html = html.replace(/data-main=["'](\/[^"']*?)["']/gi, (match, path) => {
    console.log(`Found data-main: ${path}`);
    // 跳过已带代理前缀、绝对路径、协议相对路径
    if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      console.log(`Skipping data-main path: ${path}`);
      return match;
    }
    const rewritten = `data-main="${proxyPrefix}${path}"`;
    console.log(`Rewritten data-main to: ${rewritten}`);
    return rewritten;
  });

  // 处理meta refresh标签
  html = html.replace(/<meta([^>]*?)\s+http-equiv=["']refresh["'][^>]*?url=["'](\/[^"']*?)["']/gi, (match, attrs, path) => {
    console.log(`Found meta refresh: ${path}`);
    // 跳过已带代理前缀、绝对路径、协议相对路径
    if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      console.log(`Skipping meta refresh path: ${path}`);
      return match;
    }
    const rewritten = `<meta${attrs} url="${proxyPrefix}${path}"`;
    console.log(`Rewritten meta refresh to: ${rewritten}`);
    return rewritten;
  });

  // 处理内联样式中的URL
  html = html.replace(/(style=["'][^"']*?)url\(["']?(\/[^"')]+)["']?\)/gi, (match, prefix, path) => {
    console.log(`Found inline style url: ${path}`);
    // 跳过已带代理前缀、绝对路径、协议相对路径
    if (path.startsWith('/proxy/') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      console.log(`Skipping inline style path: ${path}`);
      return match;
    }
    const rewritten = `${prefix}url("${proxyPrefix}${path}")`;
    console.log(`Rewritten inline style to: ${rewritten}`);
    return rewritten;
  });

  // 处理base标签
  html = html.replace(/<base([^>]*?)\s+href=["'](\/[^"']*?)["']/gi, (match, attrs, path) => {
    console.log(`Found base href: ${path}`);
    const rewritten = `<base${attrs} href="${proxyPrefix}"`;
    console.log(`Rewritten base to: ${rewritten}`);
    return rewritten;
  });

  // 关键：注入一个脚本，在应用代码运行前设置 OPENLIST_CONFIG.api 为代理前缀
  // OpenList 的逻辑：let Pr="/"; if(config.api) Pr=config.api; if(Pr==="/") Pr=location.origin
  // 设置 api 为代理前缀后，axios baseURL = Pr + "/api" = 代理前缀 + "/api"
  // 这样所有 /api/... 请求都会走代理路径，而不是直接打到代理服务器本地
  // 注意：不修改 base_path，因为它用于其他拼接逻辑（如路由）需要保留为 "/"
  const configInjection = `<script>
    window.__PROXY_PREFIX__ = ${JSON.stringify(proxyPrefix)};
    if (window.OPENLIST_CONFIG) {
      window.OPENLIST_CONFIG.api = ${JSON.stringify(proxyPrefix)};
      window.__dynamic_base__ = ${JSON.stringify(proxyPrefix)};
    }
  </script>`;

  // 在 OPENLIST_CONFIG 定义所在的整个 <script> 块结束之后注入配置覆盖脚本
  // 注意：原始HTML中 OPENLIST_CONFIG = {...} 和 window.__dynamic_base__ = ... 在同一个 <script> 块内
  // 如果插在 OPENLIST_CONFIG 对象之后，会切断 script 块导致后续代码变成裸露文本显示在页面上
  // 所以必须匹配到 </script> 才插入。使用 [\s\S]*? 非贪婪匹配第一个 </script>
  html = html.replace(
    /(<script>\s*window\.OPENLIST_CONFIG\s*=\s*\{[\s\S]*?<\/script>)/,
    `$1\n${configInjection}`
  );

  // 同时移除之前可能错误改写的 base_path（还原成 "/"）
  html = html.replace(
    /(base_path\s*:\s*)(["'])\/proxy\/https?:\/\/[^"']+\/\2/gi,
    `$1$2/$2`
  );

  return html;
}

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

    // 解析请求URL以获取代理前缀
    const reqUrl = new URL(req.url);
    const proxyPrefix = `/proxy/${target.origin}`;

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

    // 5. 如果响应是HTML内容，重写其中的静态资源路径
    let responseBody = response.body;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html") && responseBody) {
      // 读取HTML内容
      const htmlText = await new Response(responseBody).text();
      console.log("Original HTML snippet:", htmlText.substring(0, 500));

      // 解析请求URL以获取正确的代理前缀
      const reqUrl = new URL(req.url);
      let proxyPrefix = `/proxy/${target.origin}`;

      // 检查请求是否来自动态代理
      if (reqUrl.pathname.startsWith("/proxy/")) {
        const parsed = parseProxyPath(reqUrl);
        if (parsed) {
          proxyPrefix = `/proxy/${new URL(parsed.targetUrl).origin}`;
        }
      }
      console.log(`Using proxyPrefix: ${proxyPrefix}`);

      // 重写静态资源路径
      const rewrittenHtml = await rewriteHtmlStaticResources(htmlText, proxyPrefix);
      console.log("Rewritten HTML snippet:", rewrittenHtml.substring(0, 500));

      // 创建新的响应体流
      responseBody = new Response(rewrittenHtml).body;
      if (responseBody) {
        // 更新Content-Length头
        responseHeaders.set("content-length", new TextEncoder().encode(rewrittenHtml).length.toString());
      }
    }

    // 6. 返回响应，直接传递响应体流
    return new Response(responseBody, {
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
 * 解析代理路径，提取目标URL和资源路径
 * /proxy/https://example.com/assets/test.js -> { targetUrl: "https://example.com", resourcePath: "/assets/test.js" }
 */
function parseProxyPath(url: URL): { targetUrl: string; resourcePath: string } | null {
  // pathname 形如 /proxy/https://example.com/assets/test.js
  const pathParts = url.pathname.split("/proxy/");
  if (pathParts.length < 2 || !pathParts[1]) {
    return null;
  }

  const fullPath = decodeURIComponent(pathParts[1]);
  const targetUrlMatch = fullPath.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);

  if (!targetUrlMatch) {
    return null;
  }

  const targetUrl = targetUrlMatch[1];
  const resourcePath = targetUrlMatch[2] || "/";

  return {
    targetUrl: targetUrl + url.search,
    resourcePath: resourcePath
  };
}

/**
 * 解析 /proxy/ 前缀后的目标 URL。
 * /proxy/https://example.com/path?q=1 -> https://example.com/path?q=1
 * 与 parseProxyPath 不同：此函数用于简单的动态代理场景，
 * 将整段 URL（含 query）作为目标转发，不拆分为 targetUrl + resourcePath。
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

  // 处理重写后的静态资源路径（如/proxy/https://example.com/assets/test.js）
  if (url.pathname.includes("/proxy/https:") || url.pathname.includes("/proxy/http:")) {
    const parsed = parseProxyPath(url);
    if (parsed) {
      const targetUrl = parsed.targetUrl.replace(/\/$/, "") + parsed.resourcePath;
      return proxyTo(targetUrl, req);
    }
  }

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
  Deno.serve({ port: 8003 }, handler);
}
