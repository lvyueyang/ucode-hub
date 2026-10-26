/**
 * 文件存储抽象契约：定义统一接口，供各存储实现（本地/对象存储）遵循
 * 纯契约模块，不读 env、不创建单例；实现与单例由宿主 shared-services/storage 提供
 */
import type { Readable } from "node:stream";

/** 存储适配器接口 */
export interface StorageAdapter {
  /** 保存文件，返回存储后的文件路径 */
  save(filePath: string, content: Buffer | Readable): Promise<string>;
  /** 读取文件 */
  read(filePath: string): Promise<Buffer>;
  /** 删除文件 */
  delete(filePath: string): Promise<void>;
  /** 获取文件访问 URL */
  getUrl(filePath: string): string;
  /** 检查文件是否存在 */
  exists(filePath: string): Promise<boolean>;
}
