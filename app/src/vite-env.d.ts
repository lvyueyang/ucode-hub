/// <reference types="vite/client" />

declare global {
  /** 应用版本号（由 vite.config.ts 从 app/package.json 构建时注入） */
  const __APP_VERSION__: string;

  namespace NodeJS {
    interface ProcessEnv {
      /** PostgreSQL 连接 URL */
      DATABASE_URL: string;
      /** JWT access token 密钥（至少 32 字符） */
      JWT_SECRET: string;
      /** 系统配置敏感值加密主密钥（32 字节 Base64 或 64 位十六进制；缺失时读取敏感配置将报错） */
      CONFIG_ENCRYPTION_KEY?: string;
      /** 日志级别 */
      LOG_LEVEL?: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
      /** 运行环境 */
      NODE_ENV?: "development" | "production" | "test";
      /** 数据存储目录（日志、上传文件等） */
      STORAGE_DIR?: string;
    }
  }
}

export {};
