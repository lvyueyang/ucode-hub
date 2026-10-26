/** @vitest-environment jsdom */
/**
 * SFn 错误提示与详情弹窗测试：单行「详情」入口 + 根级弹窗展示
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SfnErrorDialogHost } from "#/components/SfnErrorDialog";
import { SfnErrorNotice } from "#/components/SfnErrorNotice";
import type { SfnErrorInfo } from "#/utils/sfn-error";

afterEach(cleanup);

function renderNotice(info: SfnErrorInfo) {
  return render(
    <>
      <SfnErrorNotice info={info} />
      <SfnErrorDialogHost />
    </>,
  );
}

describe("SfnErrorNotice", () => {
  it("无详情时不展示「详情」按钮", () => {
    renderNotice({ title: "库存不足" });
    expect(screen.queryByText("详情")).toBeNull();
  });

  it("点击「详情」弹出弹窗并展示请求号 / SFn 方法名", () => {
    renderNotice({
      title: "系统错误，请稍后重试",
      details: { requestId: "req-1", sfnName: "getFooSFn" },
    });
    fireEvent.click(screen.getByText("详情"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("req-1")).toBeTruthy();
    expect(screen.getByText("getFooSFn")).toBeTruthy();
  });

  it("点击「关闭」关闭弹窗", () => {
    renderNotice({
      title: "系统错误，请稍后重试",
      details: { requestId: "req-2" },
    });
    fireEvent.click(screen.getByText("详情"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("关闭"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
