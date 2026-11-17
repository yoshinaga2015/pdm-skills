// 画面の作り方の見本: 通信を録る。場面の操作を実際の時間で行い、HTTP と WebSocket の通信を録る。
//   node record.mjs --origin http://localhost:<アプリの開発サーバーのポート> --scene video/scenes/demo.mjs --out video/recordings/demo.json
//
// 録ったファイルには、アプリの応答がそのまま入る。git に入れない(.gitignore)。
// デモ用の利用者の、架空のデータだけを録る。本物の AI に届く操作は、録る前に利用者に確かめる。
// 鍵、トークン、クッキーは録らない。応答の本文に個人情報らしい値が無いかを、録った後に確かめる。
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const { values } = parseArgs({ options: { origin: { type: "string" }, scene: { type: "string" }, out: { type: "string" } } });
const scene = (await import(pathToFileURL(path.resolve(values.scene)).href)).default;
const apiPrefix = scene.apiPrefix ?? "/api/";
const t0 = Date.now();
const now = () => Date.now() - t0;
const http = [];
const sockets = [];
let sendAt = null;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: scene.vertical?.app ?? { width: scene.width, height: scene.height }, locale: scene.locale ?? "ja-JP", timezoneId: scene.timezoneId ?? "Asia/Tokyo", colorScheme: "light" });
// 少しずつ流す応答は、ページの中の fetch で応答を2つに分け、片方をバイト列のまま Node へ送って録る。
// page.on("response") の本文は、content-type に文字コードが無いと別の文字コードとして読まれ、文字が化ける
const streams = new Map();
await context.exposeBinding("__recordStream", (_, m) => {
  if (!streams.has(m.id)) streams.set(m.id, { t: now(), method: m.method, path: m.path, requestBody: m.body, status: m.status, contentType: m.contentType, chunks: [] });
  const s = streams.get(m.id);
  if (m.chunk) s.chunks.push(Buffer.from(m.chunk, "base64"));
});
await context.addInitScript(() => {
  const original = window.fetch.bind(window);
  let n = 0;
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("event-stream") || res.body === null) return res;
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const meta = { id: String(n++), method: (init?.method ?? "GET").toUpperCase(), path: url.pathname + url.search, body: typeof init?.body === "string" ? init.body : "", status: res.status, contentType };
    const [forApp, forRecord] = res.body.tee();
    (async () => {
      const reader = forRecord.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let bin = "";
        for (const b of value) bin += String.fromCharCode(b);
        await window.__recordStream({ ...meta, chunk: btoa(bin) });
      }
      await window.__recordStream(meta);
    })();
    return new Response(forApp, { status: res.status, headers: res.headers });
  };
});
const page = await context.newPage();
const pending = new Set();
page.on("response", (res) => {
  const u = new URL(res.url());
  if (!u.pathname.startsWith(apiPrefix)) return;
  if ((res.headers()["content-type"] ?? "").includes("event-stream")) return;
  const t = now();
  const job = (async () => {
    const contentType = res.headers()["content-type"] ?? "";
    let body = Buffer.alloc(0);
    try { body = await res.body(); } catch {}
    http.push({ t, method: res.request().method(), path: u.pathname + u.search, requestBody: res.request().postData() ?? "", status: res.status(), contentType, stream: contentType.includes("event-stream"), base64: body.toString("base64") });
  })();
  pending.add(job);
  job.finally(() => pending.delete(job));
});
if (scene.wsPattern) {
  page.on("websocket", (ws) => {
    if (!new RegExp(scene.wsPattern).test(ws.url())) return;
    const s = { url: ws.url(), frames: [] };
    sockets.push(s);
    ws.on("framesent", (f) => s.frames.push({ dir: "out", t: now(), payload: String(f.payload) }));
    ws.on("framereceived", (f) => s.frames.push({ dir: "in", t: now(), payload: String(f.payload) }));
  });
}

await page.goto(values.origin + (scene.url ?? "/"), { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
// 場面の操作を、実際の時間で行う。コマの間隔は 1/fps 秒
const msPerFrame = 1000 / scene.fps;
for (const a of [...scene.actions].sort((x, y) => x.at - y.at)) {
  if (a.type === "stream") continue;
  if (a.send) sendAt = now();
  if (a.type === "click") await page.click(a.selector);
  if (a.type === "type") await page.keyboard.type(a.text, { delay: (a.every ?? 2) * msPerFrame });
  if (a.type === "press") await page.keyboard.press(a.key);
}
// 応答が終わるまで待つ
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
await Promise.all([...pending]);
for (const st of streams.values()) {
  const { chunks, ...rest } = st;
  http.push({ ...rest, stream: true, base64: Buffer.concat(chunks).toString("base64") });
}
await page.screenshot({ path: values.out.replace(/\.json$/, ".png") });
fs.mkdirSync(path.dirname(values.out), { recursive: true });
fs.writeFileSync(values.out, JSON.stringify({ origin: values.origin, sendAt, http, sockets }, null, 1));
console.log(`録った: HTTP ${http.length}件(流す応答 ${http.filter((h) => h.stream).length}件)、WebSocket ${sockets.length}本、送った時刻 ${sendAt}ms`);
await browser.close();
