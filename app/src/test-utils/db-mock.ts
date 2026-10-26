/**
 * 测试专用 Drizzle mock 工具：构造 select 查询链
 * 服务端模块统一使用标准 query builder（db.select().from().where().limit()），
 * 测试中用本工具模拟该链式对象，await 时解析为指定数据行，避免各测试重复手写链式 mock。
 * 仅在测试文件内使用，禁止被生产代码引用。
 */
import { vi } from "vitest";

/** select 查询链 mock 类型：各链式方法返回自身，整体可被 await 解析为 rows */
export type MockSelectChain = ReturnType<typeof mockSelect>;

/**
 * 构造 select 查询链 mock：from / where / innerJoin / leftJoin / orderBy / limit / offset 等均返回链自身，
 * 整体为 thenable，await 后解析为 rows。
 * @param rows 查询结果行数组（findFirst 场景传单元素数组，缺省为空数组）
 */
export function mockSelect(rows: unknown[] = []) {
  const thenable = {
    // biome-ignore lint/suspicious/noThenProperty: 有意构造 thenable，使 select 链可被 await 解析为 rows
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(rows).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(rows).finally(onFinally),
  };
  const chain = {
    from: vi.fn((..._args: unknown[]) => chain),
    where: vi.fn((..._args: unknown[]) => chain),
    innerJoin: vi.fn((..._args: unknown[]) => chain),
    leftJoin: vi.fn((..._args: unknown[]) => chain),
    groupBy: vi.fn((..._args: unknown[]) => chain),
    having: vi.fn((..._args: unknown[]) => chain),
    orderBy: vi.fn((..._args: unknown[]) => chain),
    limit: vi.fn((..._args: unknown[]) => chain),
    offset: vi.fn((..._args: unknown[]) => chain),
    $dynamic: vi.fn((..._args: unknown[]) => chain),
  };
  return Object.assign(chain, thenable);
}
