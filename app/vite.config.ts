import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";

/** 应用版本号（来自 app/package.json，构建时注入 __APP_VERSION__） */
const appVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // @easyx/image-toolkit 以 `new Worker(new URL('./engine/worker.js', import.meta.url))`
  // 与 `new URL('./engine/magick.wasm', import.meta.url)` 静态引用引擎资源，
  // 需由 Vite 处理其 dist 产物；npm 依赖默认会被预打包导致资源丢失，故排除
  optimizeDeps: { exclude: ["@easyx/image-toolkit"] },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.(functions|server|schemas)\\.ts$|__tests__",
      },
      importProtection: {
        client: {
          // 服务端专属依赖：客户端误引即构建失败（captcha 引擎等服务端文件依赖 opentype.js + Buffer）；
          // node:crypto 覆盖「中间件经 start.ts 同时进入客户端模块图」这类误引（浏览器侧只会拿到会抛错的空壳）
          specifiers: ["bcryptjs", "drizzle-orm", "openai", "opentype.js", "node:crypto"],
        },
      },
    }),
    viteReact(),
    // Nitro 只负责打包，server.ts 由 Nitro 自动检测作为 server entry。
    // serverDir 声明服务端目录扫描（server/routes/**、server/middleware/** → 路由与全局中间件）：
    // 中继的数据面（隧道升级与 ingress 回灌）走这一层，直接拿裸请求 / 响应，不经过 TanStack 的路由与请求体处理。
    // features.websocket 开启 WebSocket：生产 node preset 挂 upgrade 监听，dev 的 vite dev server 同样透传。
    nitro({ serverDir: "server", features: { websocket: true } }),
    // 修复：Vite dev server 在 Sec-Fetch-Dest: image 时会将路由当作静态资源拦截，
    // 导致 <img> 标签加载图片返回 404。此插件在 Vite 内部中间件之前移除该请求头
    secFetchDestImageFix(),
  ],
});

/** 开发环境修复：移除 Sec-Fetch-Dest: image 避免 Vite 内部中间件拦截 */
function secFetchDestImageFix(): PluginOption {
  return {
    name: "sec-fetch-dest-image-fix",
    configureServer(server) {
      server.middlewares.stack.unshift({
        route: "",
        handle: (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
          if (req.headers["sec-fetch-dest"] === "image") {
            delete req.headers["sec-fetch-dest"];
          }
          next();
        },
      } as never);
    },
  };
}

export default config;
