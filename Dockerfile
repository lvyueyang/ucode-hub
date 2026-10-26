# hub 的生产镜像。**构建上下文是本仓库根**（Dockerfile 就在根下）：
#
#   docker build -t hub .
#
# 运行期不需要 node_modules——第三方依赖已被 Nitro 打进 `.output/server/_libs/`。

# 构建阶段
FROM node:24-slim AS builder
# 默认与部署环境的镜像源一致，未显式传参时也走镜像源
ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /repo

ENV npm_config_registry=$NPM_REGISTRY
ENV PNPM_HOME=/tmp/pnpm-home
# CI 环境：pnpm 在无 TTY 时自动确认模块目录清理，避免 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
ENV CI=true

# 全局安装 pnpm 12（与根 package.json 的 packageManager 大版本一致）；走 npm 安装，registry 由 NPM_REGISTRY 控制
RUN npm install -g pnpm@12

# 依赖层：只拷清单，源码改动不会让这一层失效
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json
COPY packages/lib/package.json ./packages/lib/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/ui-spa/package.json ./packages/ui-spa/package.json
COPY packages/ui-ssr/package.json ./packages/ui-ssr/package.json

# pnpm store 走 BuildKit 缓存挂载：不进镜像层，重建时依赖可复用。
# `--ignore-scripts`：只做构建期用得到的依赖，这个阶段不需要跑依赖自带的安装脚本
RUN --mount=type=cache,target=/tmp/pnpm-store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --store-dir /tmp/pnpm-store --config.package-import-method=copy

COPY . .

RUN pnpm --filter @ucode/hub build

# 运行阶段
FROM node:24-alpine AS runner

# 统一容器时区为业务时区（Asia/Shanghai）：定时任务、日志切割、业务日期口径一致
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# tini 作为 PID 1：正确转发信号（SIGTERM 优雅关闭）并回收僵尸进程
RUN apk add --no-cache tini tzdata

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /repo/app/.output ./.output
COPY --from=builder --chown=nodejs:nodejs /repo/app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /repo/app/drizzle ./drizzle

RUN mkdir -p data && chown nodejs:nodejs /app/data

USER nodejs

EXPOSE 3009

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3009/health').then(function(r){if(!r.ok)process.exit(1)}).catch(function(){process.exit(1)})" || exit 1

VOLUME ["/app/data"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
