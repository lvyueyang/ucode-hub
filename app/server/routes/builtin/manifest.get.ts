/**
 * 内置资产清单：`GET /builtin/manifest`
 *
 * 设备身份鉴权（与隧道同一套 deviceToken）；清单随发布而变，故带 `cache-control: no-store`
 * ——内容寻址的是资产内容，清单本身不是。
 */
import { defineEventHandler } from "nitro/h3";

import { authorizeBuiltinDevice } from "#/services/builtin-assets/builtin-assets.auth.server";
import { readBuiltinManifest } from "#/services/builtin-assets/builtin-assets.server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default defineEventHandler(async (event) => {
  const device = await authorizeBuiltinDevice(event.req);
  if (!device) {
    return new Response(JSON.stringify({ error: "设备令牌无效或已吊销" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  return new Response(JSON.stringify(readBuiltinManifest()), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
