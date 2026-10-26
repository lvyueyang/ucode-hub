/**
 * 仪表盘统计服务层：客户端用户规模
 */
import { isNull } from "drizzle-orm";
import { db } from "#/db/index";
import { clientUser } from "#/db/schema";

/** 获取未删除的客户端用户总数 */
export async function getClientUserTotal(): Promise<number> {
  return db.$count(db.select().from(clientUser).where(isNull(clientUser.deletedAt)));
}
