/*
123 云盘会员青春版 - Quantumult X rewrite edition

用法:
1. 将本文件放到 Quantumult X / Scripts 目录。
2. 将同目录下的 "123 云盘会员青春版.qx.conf" 片段导入到 [rewrite_local] / [mitm]。

说明:
- 仅保留网络层改写能力。
- 不包含原 Userscript 的设置 UI、页面提示、DOM 注入、按钮点击等浏览器专属功能。
- 原脚本里依赖运行时条件决定是否“提前伪造响应”的安全锁逻辑未默认迁移，
  避免 QX 的 script-echo-response 静态匹配误拦正常请求。
*/

const CONFIG_KEY = "123pan_youth_member_qx_config";
const DEFAULT_SETTINGS = {
  vip: true,
  svip: true,
  pvip: true,
  dads: true,
  name: "",
  photo: "",
  mail: "",
  phone: "",
  id: "",
  level: "",
  endtime: 253402185600,
  debug: false,
};

const SECURITY_BLOCK_CODES = [5107, 5104, 5300, 6006, 6001, 100011, 5012];

const settings = loadSettings();
const request = typeof $request !== "undefined" ? $request : null;
const response = typeof $response !== "undefined" ? $response : null;

main();

function main() {
  if (!request || !request.url) {
    done({});
    return;
  }

  const url = new URL(request.url);

  try {
    if (response) {
      handleResponseBody(url);
      return;
    }

    if (isDownloadInfo(url)) {
      handleRequestHeader(url);
      return;
    }

    handleEchoResponse(url);
  } catch (error) {
    log(`Unhandled error: ${String(error && error.stack ? error.stack : error)}`);
    done(response ? response.body || "" : {});
  }
}

function handleResponseBody(url) {
  let body = response.body || "";
  if (!body) {
    done(body);
    return;
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    log(`Skip non-JSON response for ${url.pathname}`);
    done(body);
    return;
  }

  const original = settings.debug ? deepClone(json) : null;

  if (containsPath(url, "api/user/info") && settings.vip === true) {
    rewriteUserInfo(json);
  } else if (containsPath(url, "api/vip/buy_list") && settings.vip === true) {
    rewriteBuyList(json);
  } else if (containsPath(url, "api/user/benefit") && settings.vip === true) {
    rewriteBenefit(json);
  } else if (isDownloadInfo(url)) {
    rewriteDownloadInfo(json, url);
  } else if (containsPath(url, "api/video/play/info")) {
    rewriteVideoPlayInfo(json);
  }

  if (settings.debug) {
    logObject("response-before", original);
    logObject("response-after", json);
  }

  done(JSON.stringify(json));
}

function handleRequestHeader(url) {
  const headers = normalizeHeaders(request.headers || {});
  headers.platform = "android";

  if (settings.debug) {
    logObject(`request-header ${url.pathname}`, headers);
  }

  done({ headers });
}

function handleEchoResponse(url) {
  let result = null;

  if (containsPath(url, "user/report/info")) {
    result = jsonResponse({
      code: 0,
      message: "ok",
      data: {
        vipType: currentVipType(),
        vipSub: 0,
        developSub: 0,
        packType: [0],
      },
      "x-traceID": null,
    });
  } else if (
    isSecuritySensitive(url) &&
    (settings.mail || settings.phone || settings.id)
  ) {
    result = jsonResponse({
      code: containsPath(url, "order/prepayment")
        ? randomItem(SECURITY_BLOCK_CODES)
        : 400,
      message:
        "为确保账户安全，修改任意一个关键数据（邮箱、手机号、ID）后，将禁止执行本操作（123 云盘会员青春版）",
      data: null,
    });
  } else if (containsPath(url, "api/getBaseUrl")) {
    result = jsonResponse({ apiUrl: url.origin });
  } else if (containsPath(url, "api/get/server/time")) {
    result = jsonResponse({
      code: 0,
      message: "success",
      data: {
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
  } else if (containsPath(url, "transfer/metrics/whether/report")) {
    result = jsonResponse({
      code: 0,
      message: "success",
      data: {
        dll_err_open: 1,
        download_coroutine: 10,
        duration: 300,
        pc_report: 0,
        status: false,
        upload_coroutine: 5,
        web_report: 0,
      },
    });
  } else if (
    [
      "api/metrics/up",
      "video/metrics/whether/report",
      "api/video/metrics",
      "restful/goapi/v1/content/payment/purchase-status",
    ].some((path) => containsPath(url, path))
  ) {
    result = jsonResponse({
      code: 0,
      message: "success",
      data: {
        status: true,
      },
    });
  } else if (url.host.indexOf("shujupie") !== -1 && containsPath(url, "web_logs")) {
    result = jsonResponse({
      imprint: base64Encode(
        JSON.stringify({
          install_campaign: "unknown",
          install_channel: "unknown",
          install_referer_domain: "unknown",
          install_datetime: "unknown",
        })
      ),
    });
  } else if (url.host.indexOf("arms-retcode") !== -1 && containsPath(url, "r.png")) {
    result = {
      status: "HTTP/1.1 200 OK",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: "",
    };
  }

  if (settings.debug && result) {
    logObject(`echo-response ${url.pathname}`, result);
  }

  done(result || {});
}

function rewriteUserInfo(json) {
  const data = ensureObject(json, "data");
  const userVipDetail = ensureObject(data, "UserVipDetail");
  const oldDetailInfos = Array.isArray(data.UserVipDetailInfos)
    ? data.UserVipDetailInfos
    : [];

  data.Vip = true;
  data.VipLevel = currentVipType();
  userVipDetail.VipCode = currentVipType();
  if (settings.dads === true) data.IsShowAdvertisement = false;

  const vipEndTime = new Date(Number(settings.endtime || DEFAULT_SETTINGS.endtime) * 1000);
  data.VipExpire = formatDateTime(vipEndTime);

  const customInfos = [
    {
      VipDesc: "青春创始包：",
      TimeDesc: `${formatDateTime(new Date(1638288000 * 1000))} 生效`,
    },
    {
      VipDesc: "衣食所系包：",
      TimeDesc: `${formatDateTime(new Date(1727539200 * 1000))} 生效`,
    },
    {
      VipDesc: `${settings.svip === true ? "SVIP会员" : "VIP会员"}：`,
      TimeDesc: `${formatDateTime(vipEndTime)} 到期`,
      IsUse: vipEndTime.getTime() >= Date.now(),
      endTime: Number(settings.endtime || DEFAULT_SETTINGS.endtime),
      EndTime: Number(settings.endtime || DEFAULT_SETTINGS.endtime),
      StartTime: 1638288000,
    },
  ];

  data.UserVipDetailInfos = customInfos.concat(oldDetailInfos);
  userVipDetail.UserVipDetailInfos = data.UserVipDetailInfos;

  if (settings.pvip === true) {
    data.VipExpire = "永久有效";
    userVipDetail.UserPermanentVIPDetailInfos = [
      {
        VipDesc: "长期VIP会员：",
        TimeDesc: "永久有效",
        IsUse: true,
      },
    ];
  }
}

function rewriteBuyList(json) {
  const data = ensureObject(json, "data");
  if (!Array.isArray(data.OrderList)) {
    return;
  }

  const now = new Date();
  const list = [];

  if (settings.pvip === true) {
    list.push({
      orderId: generateOrderNo(now),
      createAt: formatDateTime(now),
      productExplain: "云盘长期会员（模拟）",
      updateAt: formatDateTime(new Date(Date.now() + 60 * 1000)),
      amount: 0,
      originAmount: 3000,
      itemType: 1,
      memberLevel: "PVIP",
      isCreditGoods: false,
      signNo: "",
      continuousPayment: 0,
    });
  }

  list.push({
    orderId: generateOrderNo(now, "VMH", "02", "V2CS"),
    createAt: formatDateTime(now),
    productExplain: `云盘${settings.svip === true ? "SVIP" : "VIP"}会员（模拟）`,
    updateAt: formatDateTime(new Date(Date.now() + 60 * 1000)),
    amount: 0,
    originAmount: 3000,
    itemType: 1,
    memberLevel: settings.svip === true ? "SVIP" : "VIP",
    isCreditGoods: false,
    signNo: "",
    continuousPayment: 0,
  });

  data.OrderList = list.concat(data.OrderList);
}

function rewriteBenefit(json) {
  const data = ensureObject(json, "data");
  if (!Array.isArray(data.benefitList)) {
    return;
  }

  const benefitList = [];
  if (settings.pvip === true) {
    benefitList.push({
      benefitType: "会员权益",
      desc: "长期VIP(模拟)",
      startTime: formatDateTime(new Date(1638288000 * 1000)),
      endTime: "",
      sourceType: "123 云盘会员青春版",
      isEffect: true,
    });
  }

  benefitList.push({
    benefitType: "会员权益",
    desc: `${settings.svip === true ? "SVIP" : "VIP"}(模拟)`,
    startTime: formatDateTime(new Date(1638288000 * 1000)),
    endTime: formatDateTime(
      new Date(Number(settings.endtime || DEFAULT_SETTINGS.endtime) * 1000)
    ),
    sourceType: "123 云盘会员青春版",
    isEffect: true,
  });

  data.benefitList = benefitList.concat(data.benefitList);
}

function rewriteDownloadInfo(json, requestUrl) {
  const data = json && json.data ? json.data : null;
  if (data && (data.DownloadUrl || data.DownloadURL)) {
    const key = data.DownloadUrl ? "DownloadUrl" : "DownloadURL";
    try {
      data[key] = buildDownloadUrl(data[key]);
    } catch (error) {
      log(`Download URL rewrite failed: ${String(error)}`);
    }
  }

  if (
    json &&
    (json.code === 5113 ||
      json.code === 5114 ||
      (typeof json.message === "string" &&
        json.message.indexOf("下载流量已超出") !== -1))
  ) {
    if (containsPath(requestUrl, "batch_download")) {
      json.code = 400;
      json.message =
        "请不要多选文件！服务器不允许免费使用打包下载，已为您拦截支付窗口（123 云盘会员青春版）";
      json.data = null;
    } else {
      json.code = 400;
      json.message =
        "您今日下载流量已超出限制。服务器不允许免费获取下载直链，已为您拦截支付窗口（123 云盘会员青春版）";
      json.data = null;
    }
  }
}

function rewriteVideoPlayInfo(json) {
  const data = json && json.data ? json.data : null;
  if (!data || !Array.isArray(data.video_play_info)) {
    return;
  }

  data.video_play_info = data.video_play_info.filter((item) => item && item.url !== "");
}

function buildDownloadUrl(rawUrl) {
  const originalUrl = new URL(rawUrl);

  if (originalUrl.origin.indexOf("web-pro") !== -1) {
    const params = safeBase64Decode(originalUrl.searchParams.get("params") || "");
    const directUrl = new URL(params, originalUrl.origin);
    directUrl.searchParams.set("auto_redirect", "0");
    originalUrl.searchParams.set("params", base64Encode(directUrl.href));
    return decodeURIComponent(originalUrl.href);
  }

  originalUrl.searchParams.set("auto_redirect", "0");
  const newUrl = new URL("https://web-pro2.123952.com/download-v2/");
  newUrl.searchParams.set("params", base64Encode(encodeURI(originalUrl.href)));
  newUrl.searchParams.set("is_s3", "0");
  return decodeURIComponent(newUrl.href);
}

function loadSettings() {
  const stored = parseJsonSafe(
    typeof $prefs !== "undefined" ? $prefs.valueForKey(CONFIG_KEY) || "" : ""
  );
  return Object.assign({}, DEFAULT_SETTINGS, stored || {});
}

function normalizeHeaders(headers) {
  const normalized = {};
  Object.keys(headers || {}).forEach((key) => {
    normalized[key] = headers[key];
  });
  return normalized;
}

function jsonResponse(body) {
  return {
    status: "HTTP/1.1 200 OK",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

function currentVipType() {
  if (!settings.vip) return 0;
  return settings.pvip ? 3 : settings.svip ? 2 : 1;
}

function isDownloadInfo(url) {
  return [
    "file/download_info",
    "file/batch_download_info",
    "share/download/info",
    "file/batch_download_share_info",
  ].some((path) => containsPath(url, path));
}

function isSecuritySensitive(url) {
  return [
    "user/get_vcode",
    "get/mail_code",
    "user/forget_pwd",
    "user/modify_passport",
    "user/whether/modify_passport",
    "user/modify_info",
    "identify/verify",
    "user/log_off",
    "user/kick_device",
    "order/prepayment",
    "option/mail",
  ].some((path) => containsPath(url, path));
}

function containsPath(url, path) {
  return url.pathname.indexOf(path) !== -1;
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object") {
    parent[key] = {};
  }
  return parent[key];
}

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
}

function generateOrderNo(date, prefix, typeCode, channel) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const datePart = `${year}${month}${day}`;
  const timePart = `${hours}${minutes}${seconds}`;
  const randomPart = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${prefix}${datePart}${typeCode}${channel}${timePart}${randomPart}`;
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    log(`Invalid JSON in ${CONFIG_KEY}: ${String(error)}`);
    return null;
  }
}

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function log(message) {
  if (settings.debug) {
    console.log(`[123pan-qx] ${message}`);
  }
}

function logObject(label, value) {
  if (settings.debug) {
    console.log(`[123pan-qx] ${label}: ${JSON.stringify(value)}`);
  }
}

function done(payload) {
  $done(payload);
}

function safeBase64Decode(input) {
  try {
    return decodeURIComponent(base64Decode(input));
  } catch (error) {
    return base64Decode(input);
  }
}

function base64Encode(input) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let i = 0;
  while (i < input.length) {
    const chr1 = input.charCodeAt(i++);
    const chr2 = input.charCodeAt(i++);
    const chr3 = input.charCodeAt(i++);
    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    let enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }

    output += chars.charAt(enc1);
    output += chars.charAt(enc2);
    output += enc3 === 64 ? "=" : chars.charAt(enc3);
    output += enc4 === 64 ? "=" : chars.charAt(enc4);
  }
  return output;
}

function base64Decode(input) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let str = String(input).replace(/=+$/, "");
  let output = "";
  let bc = 0;
  let bs;
  let buffer;
  let idx = 0;

  while ((buffer = str.charAt(idx++))) {
    const charIndex = chars.indexOf(buffer);
    if (charIndex === -1) continue;
    bs = bc % 4 ? bs * 64 + charIndex : charIndex;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }

  return output;
}
