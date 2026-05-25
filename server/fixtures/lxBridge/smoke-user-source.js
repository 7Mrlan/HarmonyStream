/* eslint-env es2022 */
/* global lx, globalThis */

/*
 * LX Bridge smoke 用户源
 * ----------------------
 * 这是模拟“第三方 LX 用户源脚本”的 fixture，不是 Claudio 业务模块。
 * LX 用户源协议要求运行时暴露全局 lx，所以这里必须使用 lx.on / lx.send。
 */

globalThis.__lxSmokeLoadCount = (globalThis.__lxSmokeLoadCount ?? 0) + 1;

void lx.on(lx.EVENT_NAMES.request, async ({ action, info }) => {
  if (action !== 'musicUrl') return null;
  const title = info.musicInfo?.name ?? info.musicInfo?.title ?? 'unknown';
  if (title === 'throw') throw new Error('smoke source requested failure');
  if (info.musicInfo?.requestSmokeBaseUrl) {
    await runRequestSmoke(info.musicInfo.requestSmokeBaseUrl, title);
    return `https://example.com/audio/request-smoke-${globalThis.__lxSmokeLoadCount}.mp3`;
  }
  return `https://example.com/audio/${encodeURIComponent(title)}-${globalThis.__lxSmokeLoadCount}.mp3`;
});

void lx.send(lx.EVENT_NAMES.inited, {
  sources: {
    kw: {
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k', '320k'],
    },
  },
});

/*
 * 覆盖 lx.request 常见行为。
 * 只有全部请求通过后才返回播放 URL，用于确认兼容层不是摆设。
 */
async function runRequestSmoke(baseUrl, title) {
  const json = await request(`${baseUrl}/json`, {});
  if (json.body.kind !== 'json') throw new Error('json request failed');

  const text = await request(`${baseUrl}/text`, {});
  if (text.body !== 'plain text ok') throw new Error('text request failed');

  const binary = await request(`${baseUrl}/binary`, { binary: true });
  if (!binary.body || binary.body.length !== 4) throw new Error('binary request failed');

  const form = await request(`${baseUrl}/form`, {
    method: 'post',
    form: { title },
  });
  if (form.body.title !== title) throw new Error('form request failed');

  let timeoutOk = false;
  try {
    await request(`${baseUrl}/timeout`, { timeout: 50 });
  } catch {
    timeoutOk = true;
  }
  if (!timeoutOk) throw new Error('timeout request failed');
}

/* 把 LX callback 风格请求转成 Promise，便于 smoke 顺序执行。 */
function request(url, options) {
  return new Promise((resolve, reject) => {
    lx.request(url, options, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
