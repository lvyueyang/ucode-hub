import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createFileDownloadResponse, toWebStream } from "../download.server";

/** 读取 Web ReadableStream 的完整内容 */
async function readStream(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: isDone } = await reader.read();
    done = isDone;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

describe("toWebStream", () => {
  it("将 Buffer 转换为 Web ReadableStream 并保留内容", async () => {
    const stream = toWebStream(Buffer.from("hello buffer"));
    expect((await readStream(stream)).toString()).toBe("hello buffer");
  });

  it("将字符串转换为 Web ReadableStream", async () => {
    const stream = toWebStream("log line");
    expect((await readStream(stream)).toString()).toBe("log line");
  });

  it("Node Readable 流直接转换不二次包裹", async () => {
    const nodeStream = Readable.from(Buffer.from("streamed"));
    const stream = toWebStream(nodeStream);
    expect((await readStream(stream)).toString()).toBe("streamed");
  });
});

describe("createFileDownloadResponse", () => {
  it("构造 attachment 下载响应并编码中文文件名", async () => {
    const res = createFileDownloadResponse(Buffer.from("data"), {
      filename: "中文 文件.txt",
      mimeType: "text/plain",
      disposition: "attachment",
    });
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\".txt\"; filename*=UTF-8''%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.txt",
    );
    expect(await res.text()).toBe("data");
  });

  it("未传 mimeType / disposition 时使用默认值", () => {
    const res = createFileDownloadResponse(Buffer.from("x"), {
      filename: "a.bin",
    });
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"a.bin\"; filename*=UTF-8''a.bin",
    );
  });

  it("inline 语义用于内联预览", () => {
    const res = createFileDownloadResponse(Buffer.from("x"), {
      filename: "img.png",
      mimeType: "image/png",
      disposition: "inline",
    });
    expect(res.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"img.png\"; filename*=UTF-8''img.png",
    );
  });

  it("RFC 5987 对 '()* 特殊字符额外编码", () => {
    const res = createFileDownloadResponse(Buffer.from("x"), {
      filename: "report (final)*.pdf",
    });
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"report (final)*.pdf\"; filename*=UTF-8''report%20%28final%29%2A.pdf",
    );
  });

  it("filename 回退值转义双引号与反斜杠", () => {
    const res = createFileDownloadResponse(Buffer.from("x"), {
      filename: 'a"b\\c.txt',
    });
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"a_b_c.txt\"; filename*=UTF-8''a%22b%5Cc.txt",
    );
  });

  it("孤立代理项文件名不抛 URIError，替换为 U+FFFD", () => {
    const res = createFileDownloadResponse(Buffer.from("x"), {
      filename: "a\uD800b.txt",
    });
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"ab.txt\"; filename*=UTF-8''a%EF%BF%BDb.txt",
    );
  });
});
