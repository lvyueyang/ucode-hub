/**
 * 阻止浏览器自动填充的隐藏诱饵输入框
 * 在表单开头放置一对不可见的 text/password 输入框，浏览器会将自动填充填入此处而非真实字段
 */
export function AutofillBlocker() {
  return (
    <div
      style={{
        position: "absolute",
        left: -9999,
        opacity: 0,
        height: 0,
        overflow: "hidden",
      }}
    >
      <input type="text" name="fake-username" tabIndex={-1} autoComplete="off" />
      <input type="password" name="fake-password" tabIndex={-1} autoComplete="new-password" />
    </div>
  );
}
