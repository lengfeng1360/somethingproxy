// main.ts

// 固定代理目标（根路径及其他非 /proxy/ 路径会转发到此地址，保持向后兼容）
const TARGET_URL = "https://lengfeng1360-newapi.hf.space";

// ============================================================
//  通用静态资源路径重写（与站点无关）
// ============================================================

/**
 * 重写HTML内容中的静态资源路径，将相对路径转换为通过代理服务访问的绝对路径
 * @param html HTML内容
 * @param proxyPrefix 代理前缀（如"/proxy/https://example.com"）
 * @returns 重写后的HTML内容
 */
function rewriteStaticPaths(html: string, proxyPrefix: string): string {
  const targetUrlMatch = proxyPrefix.match(/^\/proxy\/(https?:\/\/[^\/]+)/);
  if (!targetUrlMatch) {
    return html;
  }

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
    { tag: 'object', attr: 'data' },
  ];

  for (const { tag, attr } of tagPatterns) {
    // 匹配 attr 不是第一个属性的情况
    const regex = new RegExp(
      `<${tag}([^>]*?)\\s+${attr}=["'](\\/[^"']*?)["']`,
      'gi',
    );
    html = html.replace(regex, (match, attrs, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `<${tag}${attrs} ${attr}="${proxyPrefix}${path}"`;
    });

    // 匹配 attr 作为第一个属性的情况
    const firstAttrRegex = new RegExp(
      `<${tag}\\s+${attr}=["'](\\/[^"']*?)["']`,
      'gi',
    );
    html = html.replace(firstAttrRegex, (match, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `<${tag} ${attr}="${proxyPrefix}${path}"`;
    });
  }

  // CSS url() 引用
  html = html.replace(
    /url\(["']?(\/[^"')]+)["']?\)/gi,
    (match, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `url("${proxyPrefix}${path}")`;
    },
  );

  // data-main 属性（AMD 加载器）
  html = html.replace(
    /data-main=["'](\/[^"']*?)["']/gi,
    (match, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `data-main="${proxyPrefix}${path}"`;
    },
  );

  // meta refresh 标签
  html = html.replace(
    /<meta([^>]*?)\s+http-equiv=["']refresh["'][^>]*?url=["'](\/[^"']*?)["']/gi,
    (match, attrs, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `<meta${attrs} url="${proxyPrefix}${path}"`;
    },
  );

  // 内联样式中的 URL
  html = html.replace(
    /(style=["'][^"']*?)url\(["']?(\/[^"')]+)["']?\)/gi,
    (match, prefix, path) => {
      if (
        path.startsWith('/proxy/') ||
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('//')
      ) {
        return match;
      }
      return `${prefix}url("${proxyPrefix}${path}")`;
    },
  );

  // base 标签
  html = html.replace(
    /<base([^>]*?)\s+href=["'](\/[^"']*?)["']/gi,
    (match, attrs) => {
      return `<base${attrs} href="${proxyPrefix}"`;
    },
  );

  return html;
}

// ============================================================
//  自动适配检测器系统
// ============================================================

interface DetectionResult {
  detected: boolean;
  confidence: number;
  strategy?: (html: string, proxyPrefix: string) => string;
}

type Detector = (html: string) => DetectionResult;

/**
 * 检测器 1：Next.js 应用
 * 特征：<script id="__NEXT_DATA__"> 或 __next 相关静态资源路径
 */
const detectNextJS: Detector = (html: string) => {
  const hasNextData = /<script\s+id="__NEXT_DATA__"/.test(html);
  const hasNextStatic = /_next\/static/.test(html);

  if (!hasNextData && !hasNextStatic) {
    return { detected: false, confidence: 0 };
  }

  return {
    detected: true,
    confidence: hasNextData ? 0.95 : 0.5,
    strategy: (html: string, proxyPrefix: string) => {
      if (!hasNextData) return html;

      return html.replace(
        /(<script\s+id="__NEXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/,
        (match, openTag, jsonStr, closeTag) => {
          try {
            const data = JSON.parse(jsonStr);

            // 修改 basePath
            if (data.basePath === '' || data.basePath === '/') {
              data.basePath = proxyPrefix;
            }

            // 递归修改 runtimeConfig 中的路径
            const rewriteObj = (obj: Record<string, unknown>): void => {
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string' && (val === '' || val === '/') && /url|base|api|endpoint|path/i.test(key)) {
                  obj[key] = proxyPrefix;
                } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                  rewriteObj(val as Record<string, unknown>);
                }
              }
            };

            if (data.runtimeConfig) {
              rewriteObj(data.runtimeConfig as Record<string, unknown>);
            }
            if (data.props?.pageProps?.runtimeConfig) {
              rewriteObj(data.props.pageProps.runtimeConfig as Record<string, unknown>);
            }

            return `${openTag}${JSON.stringify(data)}${closeTag}`;
          } catch {
            return match;
          }
        },
      );
    },
  };
};

/**
 * 检测器 2：Nuxt.js 应用
 * 特征：window.__NUXT__
 */
const detectNuxt: Detector = (html: string) => {
  const hasNuxt = /window\.__NUXT__\s*=/.test(html);
  const hasNuxtConfig = /__NUXT__/.test(html) && /config/.test(html);

  if (!hasNuxt) {
    return { detected: false, confidence: 0 };
  }

  return {
    detected: true,
    confidence: hasNuxtConfig ? 0.9 : 0.6,
    strategy: (html: string, proxyPrefix: string) => {
      // Nuxt 2/3 的配置都在 window.__NUXT__ 中
      // 注入覆盖脚本，在 __NUXT__ 赋值之后执行
      const injection = `<script>
(function(){
  var n = window.__NUXT__;
  if (!n) return;
  function rewrite(o) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(function(k) {
      if (typeof o[k] === 'string' && (o[k] === '' || o[k] === '/') && /url|base|api|endpoint|path/i.test(k)) {
        o[k] = ${JSON.stringify(proxyPrefix)};
      } else if (typeof o[k] === 'object' && o[k] !== null) {
        rewrite(o[k]);
      }
    });
  }
  if (n.config) rewrite(n.config);
  if (n.state) rewrite(n.state);
})();
</script>`;

      return html.replace(
        /(window\.__NUXT__\s*=\s*\{[\s\S]*?<\/script>)/,
        `$1\n${injection}`,
      );
    },
  };
};

/**
 * 检测器 3：JSON 标签配置
 * 特征：<script type="application/json" id="...config/...state/...data">
 */
const detectJsonTagConfig: Detector = (html: string) => {
  // 收集所有匹配的 JSON 配置标签
  const jsonTagRegex = /<script\s+type=["']application\/json["']\s+id=["']([^"']*)["']\s*>([\s\S]*?)<\/script>/gi;
  const matches: Array<{ full: string; id: string; jsonStr: string }> = [];

  for (const m of html.matchAll(jsonTagRegex)) {
    const id = m[1];
    const jsonStr = m[2];
    // 通过 id 或内容判断是否像配置
    if (/config|state|data|props|app/i.test(id) || /api|url|base|endpoint/i.test(jsonStr)) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed === 'object' && parsed !== null) {
          matches.push({ full: m[0], id, jsonStr });
        }
      } catch {
        /* 不是合法 JSON，跳过 */
      }
    }
  }

  if (matches.length === 0) {
    return { detected: false, confidence: 0 };
  }

  return {
    detected: true,
    confidence: 0.8,
    strategy: (html: string, proxyPrefix: string) => {
      for (const { full, jsonStr } of matches) {
        try {
          const data = JSON.parse(jsonStr);
          let changed = false;

          const rewriteObj = (obj: Record<string, unknown>): void => {
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (typeof val === 'string' && (val === '' || val === '/') && /url|base|api|endpoint|path/i.test(key)) {
                obj[key] = proxyPrefix;
                changed = true;
              } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                rewriteObj(val as Record<string, unknown>);
              }
            }
          };

          rewriteObj(data as Record<string, unknown>);

          if (changed) {
            const newJson = JSON.stringify(data);
            html = html.replace(full, full.replace(jsonStr, newJson));
          }
        } catch {
          /* 解析失败，跳过 */
        }
      }
      return html;
    },
  };
};

/**
 * 检测器 4：window.XXX = { ... } 全局配置（覆盖面最广）
 * 特征：<script>window.变量名 = { ... }</script>，且对象内含路径相关 key
 *
 * 能覆盖的场景：
 *   - OpenList: window.OPENLIST_CONFIG = { api: "", base_path: "/" }
 *   - 通用 Vue/React: window.__APP_CONFIG__ = { apiUrl: "", baseUrl: "/" }
 *   - 各种自定义命名: window.SITE_CONFIG = { ... }
 */
const detectWindowConfig: Detector = (html: string) => {
  // 匹配 <script>window.变量名 = { ... };</script> 完整块
  // 使用 [\s\S]*? 非贪婪匹配，确保只取到第一个 </script>
  const configBlockRegex = /<script>\s*(window\.(\w+)\s*=\s*(\{[\s\S]*?\}))\s*;?\s*<\/script>/g;

  let bestMatch: {
    full: string;
    varName: string;
    objContent: string;
  } | null = null;
  let bestScore = 0;

  for (const m of html.matchAll(configBlockRegex)) {
    const full = m[0];
    const varName = m[2];
    const objContent = m[3];

    // 计算匹配分数：对象中路径相关 key 越多，分数越高
    let score = 0;
    const pathKeys = objContent.match(/\b(api[Uu]rl|base[Uu]rl|api[Bb]ase|base_path|basePath|endpoint|[a-zA-Z_]*[Uu]rl|[a-zA-Z_]*[Pp]ath|gateway)\s*:/g);
    if (pathKeys) score = pathKeys.length;
    // 对象不能太大（排除数据对象）
    if (objContent.length > 5000) score *= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { full, varName, objContent };
    }
  }

  if (!bestMatch || bestScore === 0) {
    return { detected: false, confidence: 0 };
  }

  const { varName } = bestMatch;

  return {
    detected: true,
    confidence: Math.min(0.5 + bestScore * 0.15, 0.95),
    strategy: (html: string, proxyPrefix: string) => {
      // 生成注入脚本，在配置对象创建后遍历并覆盖空路径
      const injection = `<script>
(function(){
  var c = window.${varName};
  if (!c || typeof c !== 'object') return;
  Object.keys(c).forEach(function(k) {
    var v = c[k];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // 递归处理嵌套对象
      Object.keys(v).forEach(function(nk) {
        var nv = v[nk];
        if (typeof nv === 'string' && (nv === '' || nv === '/') && /url|base|api|endpoint|path/i.test(nk)) {
          v[nk] = ${JSON.stringify(proxyPrefix)};
        }
      });
    }
    if (typeof v === 'string' && (v === '' || v === '/') && /url|base|api|endpoint|path/i.test(k)) {
      c[k] = ${JSON.stringify(proxyPrefix)};
    }
  });
})();
</script>`;

      // 在配置 script 块之后注入
      // 转义 varName 中的特殊字符用于正则
      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return html.replace(
        new RegExp(`(<script>\\s*window\\.${escapedVarName}\\s*=\\s*\\{[\\s\\S]*?<\\/script>)`),
        `$1\n${injection}`,
      );
    },
  };
};

/**
 * 检测器 5：内联 JSON 配置变量（非 window. 前缀）
 * 特征：<script>var config = {...}; 或 const settings = {...};
 */
const detectInlineConfig: Detector = (html: string) => {
  // 匹配 var/let/const 变量名 = { ... }（非 window. 前缀，不与 detectWindowConfig 重复）
  const inlineRegex = /<(script[^>]*)>\s*(?:var|let|const)\s+(\w+)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/gi;

  let bestMatch: { full: string; varName: string; objContent: string } | null = null;
  let bestScore = 0;

  for (const m of html.matchAll(inlineRegex)) {
    // 排除 window.XXX 已经被 detectWindowConfig 处理的情况
    if (/window\.\w+\s*=/.test(m[0])) continue;

    const varName = m[2];
    const objContent = m[3];

    let score = 0;
    const pathKeys = objContent.match(/\b(api[Uu]rl|base[Uu]rl|api[Bb]ase|base_path|basePath|endpoint|[a-zA-Z_]*[Uu]rl|[a-zA-Z_]*[Pp]ath|gateway)\s*:/g);
    if (pathKeys) score = pathKeys.length;
    if (objContent.length > 5000) score *= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { full: m[0], varName, objContent };
    }
  }

  if (!bestMatch || bestScore === 0) {
    return { detected: false, confidence: 0 };
  }

  return {
    detected: true,
    confidence: Math.min(0.4 + bestScore * 0.1, 0.75),
    strategy: (html: string, proxyPrefix: string) => {
      const { varName } = bestMatch!;
      const injection = `<script>
(function(){
  try {
    var c = ${varName};
    if (!c || typeof c !== 'object') return;
    Object.keys(c).forEach(function(k) {
      var v = c[k];
      if (typeof v === 'string' && (v === '' || v === '/') && /url|base|api|endpoint|path/i.test(k)) {
        c[k] = ${JSON.stringify(proxyPrefix)};
      }
    });
  } catch(e) {}
})();
</script>`;

      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return html.replace(
        new RegExp(`(</script>\\s*)(<script>\\s*(?:var|let|const)\\s+${escapedVarName}\\s*=\\s*\\{[\\s\\S]*?<\\/script>)`),
        `$1${injection}\n$2`,
      );
    },
  };
};

// 按优先级排列的检测器列表
const detectors: Detector[] = [
  detectNextJS,          // 高置信度，优先匹配
  detectNuxt,            // Nuxt 专用
  detectJsonTagConfig,   // JSON 标签配置
  detectWindowConfig,    // window.XXX = {} 全局配置（最宽泛）
  detectInlineConfig,    // 内联变量配置（兜底）
];

/**
 * 自动适配 HTML 内容：先做通用路径重写，再根据检测到的站点特征做针对性处理
 */
function autoAdaptHtml(html: string, proxyPrefix: string): string {
  // 1. 通用静态资源路径重写（所有站点都走）
  let result = rewriteStaticPaths(html, proxyPrefix);

  // 2. 运行所有检测器，找到最匹配的策略
  let bestResult: DetectionResult | null = null;
  for (const detect of detectors) {
    const r = detect(result);
    if (r.detected && r.strategy && r.confidence > (bestResult?.confidence ?? 0)) {
      bestResult = r;
    }
  }

  // 3. 执行最佳策略
  if (bestResult?.strategy) {
    console.log(`[Auto-Adapt] Detected site pattern, confidence: ${bestResult.confidence}`);
    result = bestResult.strategy(result, proxyPrefix);
  }

  return result;
}

// ============================================================
//  代理核心逻辑
// ============================================================

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
 * 通用代理转发函数
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

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return new Response(`Unsupported protocol: ${target.protocol}`, {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. 准备请求头
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // 3. 发起代理请求
    const response = await fetch(target.toString(), {
      method: req.method,
      headers,
      body: req.body,
      // @ts-ignore: Deno Deploy 支持 redirect 选项
      redirect: "manual",
    });

    // 4. 准备响应头
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // 5. HTML 内容自动适配
    let responseBody = response.body;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html") && responseBody) {
      const htmlText = await new Response(responseBody).text();
      console.log("Original HTML snippet:", htmlText.substring(0, 300));

      // 计算代理前缀
      const reqUrl = new URL(req.url);
      let proxyPrefix = `/proxy/${target.origin}`;

      if (reqUrl.pathname.startsWith("/proxy/")) {
        const parsed = parseProxyPath(reqUrl);
        if (parsed) {
          proxyPrefix = `/proxy/${new URL(parsed.targetUrl).origin}`;
        }
      }
      console.log(`Using proxyPrefix: ${proxyPrefix}`);

      // 自动适配：通用重写 + 站点特征检测
      const adaptedHtml = autoAdaptHtml(htmlText, proxyPrefix);
      console.log("Adapted HTML snippet:", adaptedHtml.substring(0, 300));

      responseBody = new Response(adaptedHtml).body;
      if (responseBody) {
        responseHeaders.set(
          "content-length",
          new TextEncoder().encode(adaptedHtml).length.toString(),
        );
      }
    }

    // 6. 返回响应
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    console.error("Proxy error:", error);
    const status = error instanceof Deno.errors.NotFound ? 502 : 500;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Proxy Error: ${message}`, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * 解析代理路径
 * /proxy/https://example.com/assets/test.js -> { targetUrl, resourcePath }
 */
function parseProxyPath(
  url: URL,
): { targetUrl: string; resourcePath: string } | null {
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
    resourcePath,
  };
}

/**
 * 解析 /proxy/ 前缀后的目标 URL（含 query）
 */
function parseProxyTarget(url: URL): string | null {
  const rawTarget = decodeURIComponent(url.pathname.slice("/proxy/".length));
  if (!rawTarget) {
    return null;
  }
  return rawTarget + url.search;
}

// ============================================================
//  路由处理
// ============================================================

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 处理重写后的静态资源路径
  if (
    url.pathname.includes("/proxy/https:") ||
    url.pathname.includes("/proxy/http:")
  ) {
    const parsed = parseProxyPath(url);
    if (parsed) {
      const targetUrl = parsed.targetUrl.replace(/\/$/, "") +
        parsed.resourcePath;
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

  // 固定代理：兜底转发到 TARGET_URL
  const targetUrl = new URL(TARGET_URL);
  targetUrl.pathname = url.pathname;
  targetUrl.search = url.search;
  return proxyTo(targetUrl.toString(), req);
}

// 启动服务器
if (import.meta.main) {
  console.log("Reverse proxy running on Deno Deploy");
  console.log(`  - Fixed proxy target: ${TARGET_URL}`);
  console.log("  - Dynamic proxy: /proxy/<target-url>");
  console.log("  - Auto-adapt: enabled (Next.js / Nuxt / OpenList / generic SPA)");
  Deno.serve({ port: 8003 }, handler);
}