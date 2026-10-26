/** 测试 mock 工厂自测：验证 select 查询链可链式调用并被 await 解析为指定行 */

import { describe, expect, it } from "vitest";
import { mockSelect } from "#/test-utils/db-mock";

describe("mockSelect", () => {
  it("链式方法返回链自身并可被 await 解析为 rows", async () => {
    const rows = [{ id: "1", key: "site_name" }];
    const chain = mockSelect(rows);

    expect(chain.from).toBeDefined();
    const awaited = await chain
      .from({} as never)
      .where({} as never)
      .limit(1);
    expect(awaited).toEqual(rows);
  });

  it("缺省解析为空数组", async () => {
    const chain = mockSelect();
    expect(await chain.from({} as never)).toEqual([]);
  });

  it("链式调用方法可被断言", () => {
    const chain = mockSelect([]);
    chain
      .from({} as never)
      .orderBy({} as never)
      .offset(0);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.offset).toHaveBeenCalledTimes(1);
  });
});
