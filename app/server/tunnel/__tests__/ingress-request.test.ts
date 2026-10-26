/**
 * ingress 请求侧的纯逻辑：Host 认设备、凭证抽取、转发头构造与剥离。
 */
import { describe, expect, it } from "vitest";

import {
  buildIngressRequestHeaders,
  buildIngressResponseHeaders,
  canAccessDevice,
  isUpgradeRequest,
  parseBearerToken,
  parseDeviceHost,
  parseDevicePath,
  readSessionToken,
} from "../ingress-request";

const DEVICE_ID = "3f1c9a2e-6b4d-4c8f-9a1b-2d3e4f5a6b7c";
const BASE_DOMAIN = "relay.example.com";

describe("parseDeviceHost", () => {
  it("取出子域里的设备 id（大小写不敏感）", () => {
    expect(parseDeviceHost(`${DEVICE_ID}.${BASE_DOMAIN}`, BASE_DOMAIN)).toBe(DEVICE_ID);
    expect(parseDeviceHost(`${DEVICE_ID.toUpperCase()}.RELAY.Example.com`, BASE_DOMAIN)).toBe(
      DEVICE_ID,
    );
  });

  it("带端口照样认", () => {
    expect(parseDeviceHost(`${DEVICE_ID}.${BASE_DOMAIN}:3000`, BASE_DOMAIN)).toBe(DEVICE_ID);
    expect(parseDeviceHost(`127.0.0.1:3000`, BASE_DOMAIN)).toBeNull();
  });

  it("父域自身、多级子域、非 uuid 标签都不进 ingress", () => {
    expect(parseDeviceHost(BASE_DOMAIN, BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost(`admin.${BASE_DOMAIN}`, BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost(`a.b.${BASE_DOMAIN}`, BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost(`${DEVICE_ID}.evil.example.com`, BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost("", BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost(null, BASE_DOMAIN)).toBeNull();
  });

  it("IPv6 字面量与不相关域名一律不认", () => {
    expect(parseDeviceHost(`[::1]:3000`, BASE_DOMAIN)).toBeNull();
    expect(parseDeviceHost("relay.other.com", BASE_DOMAIN)).toBeNull();
  });
});

describe("parseDevicePath", () => {
  it("取出设备 id、浏览器侧前缀与到 UCode 的路径", () => {
    expect(parseDevicePath(`/d/${DEVICE_ID}/`)).toEqual({
      deviceId: DEVICE_ID,
      basePath: `/d/${DEVICE_ID}`,
      rest: "/",
    });
    expect(parseDevicePath(`/d/${DEVICE_ID}/api/v1/events`)).toEqual({
      deviceId: DEVICE_ID,
      basePath: `/d/${DEVICE_ID}`,
      rest: "/api/v1/events",
    });
  });

  it("不带尾斜杠时也有结果，rest 是根（调用方会重定向到带尾斜杠的地址）", () => {
    expect(parseDevicePath(`/d/${DEVICE_ID}`)).toEqual({
      deviceId: DEVICE_ID,
      basePath: `/d/${DEVICE_ID}`,
      rest: "/",
    });
  });

  it("设备 id 大小写不敏感，统一按小写取", () => {
    expect(parseDevicePath(`/d/${DEVICE_ID.toUpperCase()}/x`)?.deviceId).toBe(DEVICE_ID);
  });

  it("前缀不符、缺设备 id、非 uuid 的标签都不进 ingress", () => {
    expect(parseDevicePath("/")).toBeNull();
    expect(parseDevicePath("/devices")).toBeNull();
    expect(parseDevicePath("/d/")).toBeNull();
    expect(parseDevicePath("/d/not-a-uuid/")).toBeNull();
    expect(parseDevicePath(`/x/${DEVICE_ID}/`)).toBeNull();
  });
});

describe("parseBearerToken / readSessionToken", () => {
  it("只认单段 Bearer", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearerToken("bearer abc")).toBe("abc");
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it("Cookie 里先取管理端令牌，再取客户端令牌", () => {
    expect(readSessionToken("hub_admin_token=admin-jwt; other=1")).toBe("admin-jwt");
    expect(readSessionToken("other=1; hub_client_token=client-jwt")).toBe("client-jwt");
    expect(readSessionToken("hub_admin_token=; hub_client_token=client-jwt")).toBe("client-jwt");
    expect(readSessionToken("hub_admin_token")).toBeNull();
    expect(readSessionToken("other=1")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});

describe("canAccessDevice", () => {
  const ownedByClient = { ownerType: "client" as const, ownerId: "user-1" };

  it("客户端用户只能访问自己的设备", () => {
    expect(canAccessDevice(ownedByClient, { type: "client", id: "user-1" })).toBe(true);
    expect(canAccessDevice(ownedByClient, { type: "client", id: "user-2" })).toBe(false);
    expect(canAccessDevice(ownedByClient, { type: "admin", id: "user-1" })).toBe(true);
    expect(
      canAccessDevice(
        { ownerType: "admin", ownerId: "admin-9" },
        { type: "client", id: "admin-9" },
      ),
    ).toBe(false);
  });

  it("管理端账号可访问任意设备", () => {
    expect(canAccessDevice(ownedByClient, { type: "admin", id: "admin-1" })).toBe(true);
  });
});

describe("buildIngressRequestHeaders", () => {
  const build = (headers: Record<string, string>) =>
    buildIngressRequestHeaders(new Headers(headers), { deviceId: DEVICE_ID, userId: "user-1" });

  it("剥掉调用方凭证、Host、逐跳头与 x-forwarded-*", () => {
    const forwarded = build({
      cookie: "hub_client_token=secret",
      authorization: "Bearer secret",
      host: `${DEVICE_ID}.${BASE_DOMAIN}`,
      connection: "keep-alive",
      "transfer-encoding": "chunked",
      upgrade: "websocket",
      forwarded: "for=1.2.3.4",
      "x-forwarded-for": "1.2.3.4",
      "x-forwarded-proto": "https",
      "x-hub-source": "forged",
      "content-type": "application/json",
      accept: "application/json",
    });

    expect(forwarded).toEqual({
      "content-type": "application/json",
      accept: "application/json",
      "x-hub-source": "tunnel",
      "x-hub-device": DEVICE_ID,
      "x-hub-client": "user-1",
    });
  });

  it("来源头由 hub 覆盖，调用方伪造不生效", () => {
    expect(build({ "x-hub-source": "local" })["x-hub-source"]).toBe("tunnel");
  });

  it("路径寻址时告诉 UCode 页面挂在哪个前缀下；子域寻址不带这个头", () => {
    const withPath = buildIngressRequestHeaders(new Headers(), {
      deviceId: DEVICE_ID,
      userId: "user-1",
      basePath: `/d/${DEVICE_ID}`,
    });
    expect(withPath["x-hub-base-path"]).toBe(`/d/${DEVICE_ID}`);
    expect(build({})).not.toHaveProperty("x-hub-base-path");
  });
});

describe("buildIngressResponseHeaders", () => {
  it("剥掉逐跳头，其余（含 content-length / content-encoding）原样透传", () => {
    expect(
      buildIngressResponseHeaders({
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "transfer-encoding": "chunked",
        "content-encoding": "gzip",
        "content-length": "1024",
      }),
    ).toEqual({
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "content-encoding": "gzip",
      "content-length": "1024",
    });
  });
});

describe("isUpgradeRequest", () => {
  it("只认 websocket 升级", () => {
    expect(isUpgradeRequest(new Headers({ upgrade: "WebSocket" }))).toBe(true);
    expect(isUpgradeRequest(new Headers({ upgrade: "h2c" }))).toBe(false);
    expect(isUpgradeRequest(new Headers())).toBe(false);
  });
});
