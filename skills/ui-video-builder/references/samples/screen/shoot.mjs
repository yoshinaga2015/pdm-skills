// 画面の作り方の見本: 1コマずつ撮るループ。録った通信を返し、時計を止め、決めたコマで操作し、字幕とカメラを重ねる。
//
// 場面の設定(scene)は、次の形のモジュールにする。
//   export default {
//     id: "demo", fps: 30, width: 1920, height: 1080, url: "/", apiPrefix: "/api/",
//     wsPattern: "/ws$",       // 省ける。WebSocket を使うアプリだけ。録って返す WebSocket の URL の形(正規表現の文字列)
//     responseDelayFrames: 20, // 省ける。送った後の HTTP の応答を、このコマ数だけ遅らせて返す。「更新中」のような途中の表示を映す
//     scenes: [{ id: "ask", from: 0, durationInFrames: 60 }, { id: "answer", from: 60, durationInFrames: 90, continues: true }],
//     seed: 1,                 // 省ける。乱数の種
//     randomMode: "site",      // 省ける。"site"(呼んだ場所ごとに決まった値。既定)か "sequence"(1つの種から順に)
//     hide: [".cookie-banner"], // 省ける。映さない要素の選択子。フレームワークの開発用の表示は既定で隠す
//     leadFrames: 30,          // 省ける。0コマ目の前に、撮らずに進めるコマ数。アプリが開いた直後に始める動きを済ませておく
//     actions: [
//       { at: 10, type: "click", selector: "input" },
//       { at: 12, type: "type", text: "質問の文", every: 2 },    // every コマごとに1字打つ
//       { at: 40, type: "press", key: "Enter", send: true },      // send: 送る操作。これより後は送った後の応答を返す。
//                                                                  // ボタンで送るなら { type: "click", selector, send: true }
//       { at: 50, type: "stream", perFrame: 1, every: 2 }         // このコマから、流す応答を every コマごとに perFrame 個ずつ渡す
//     ],
//     captions: [[0, 60, "質問を打ちます"], [60, 150, "AI が答えます"]],
//     camera: [[0, 0, { full: true }], [44, 52, { selector: ".chat", pad: 24, maxHeight: 600 }]],
//     // 寄る先は { full: true } か { selector, pad, maxHeight, zoom, align }。overlay.js の4節
//
//     // 縦型にするときだけ書く。アプリはパソコンの大きさ(app)のまま描き、その絵を縦の台紙の窓(window)に置く。
//     // 字幕は台紙に描く。窓の縦横の比は app と同じにする。値は 1080×1920 の台紙の px
//     vertical: {
//       app: { width: 1234, height: 800 },                       // 余白の多いアプリは、縦を小さくして余白を縮める
//       window: { x: 0, y: 560, width: 1080, height: 700 },       // 下端は 1260 まで。TikTok の下660pxは説明文に隠れる
//       captionBox: { x: 120, y: 260, width: 840, height: 300 },  // TikTok の安全域(上240px、左右120px)の中
//       background: "#0f172a"
//     },
//     // 合格試験に渡す値(省ける): picture, blank, blankExemptScenes, allowedAreas。references/acceptance.md。
//     // 縦型の picture は、ふつう vertical.window にする
//   };
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installReplay } from "./replay.mjs";

const OVERLAY = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "overlay.js"), "utf8");
const CLOCK_START = new Date("2026-01-01T10:00:00+09:00");

/**
 * chromium を起動するときの引数。部分の描き直しを止める。変わった所だけを描き直すと、
 * 何回描いたかによって、文字の縁などのぼかしが撮るたびに変わることがある
 */
export const BROWSER_ARGS = ["--disable-partial-raster"];

/**
 * 撮らないコマでも、ブラウザに1回描かせる。ブラウザは前のコマで描いた絵の一部を使い回すので、描かせないと、
 * コマの間に実際に何回描いたかで縁のぼかしが変わる。1コマに1回描かせて、描いた履歴を毎回同じにする
 */
async function drawFrame(page) {
  await page.screenshot({ animations: "allow", caret: "hide", clip: { x: 0, y: 0, width: 1, height: 1 } });
}

/** 縦型の台紙のページ。窓にアプリの絵を置き、字幕を描く */
async function openBoard(browser, scene) {
  const v = scene.vertical;
  const context = await browser.newContext({ viewport: { width: scene.width, height: scene.height }, colorScheme: "light" });
  const page = await context.newPage();
  const box = v.captionBox;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: ${scene.width}px; height: ${scene.height}px; background: ${v.background ?? "#0f172a"}; overflow: hidden; }
    #win { position: absolute; left: ${v.window.x}px; top: ${v.window.y}px; width: ${v.window.width}px; height: ${v.window.height}px; display: block; }
    #cap { position: absolute; left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
      font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; font-weight: 800; color: #fff; line-height: 1.25; }
    #cap div { white-space: nowrap; }
  </style></head><body><img id="win" alt=""><div id="cap"></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  let shown = null;
  return {
    page,
    close: () => context.close(),
    /** 窓の絵と字幕を、このコマのものにする。字幕は、いちばん長い行が箱の幅に収まる大きさにする */
    async update(png, caption) {
      await page.evaluate(
        async ({ b64, caption, width, maxPx }) => {
          const img = document.getElementById("win");
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const cap = document.getElementById("cap");
          if (cap.dataset.text !== (caption ?? "")) {
            cap.dataset.text = caption ?? "";
            cap.replaceChildren();
            const lines = (caption ?? "").split("\n").filter(Boolean);
            const longest = Math.max(1, ...lines.map((l) => [...l].length));
            const px = Math.min(maxPx, Math.floor(width / longest));
            for (const line of lines) {
              const div = document.createElement("div");
              div.textContent = line;
              div.style.fontSize = `${px}px`;
              // 見出しの印は行ごとに付ける。まとめた枠で測ると、狭い行の横まで安全域の外にかかって見える
              div.setAttribute("data-video-caption", "");
              cap.appendChild(div);
            }
          }
        },
        { b64: png.toString("base64"), caption, width: scene.vertical.captionBox.width, maxPx: scene.vertical.captionPx ?? 80 }
      );
      shown = caption;
    },
    shown: () => shown
  };
}

/**
 * 場面を 0 コマ目から to の手前まで進め、from より後のコマで onFrame と onShot を呼ぶ。
 * 呼ぶたびに新しい context を開き、前の撮影の状態を持ち越さない。browser は BROWSER_ARGS で起動したものを渡す。
 */
export async function shootScene(browser, { origin, scene, recording, from = 0, to, shoot = () => true, onShot = async () => {}, onFrame }) {
  const vertical = scene.vertical !== undefined;
  const app = vertical ? scene.vertical.app : { width: scene.width, height: scene.height };
  const context = await browser.newContext({
    viewport: app,
    locale: scene.locale ?? "ja-JP",
    timezoneId: scene.timezoneId ?? "Asia/Tokyo",
    colorScheme: "light"
  });
  const board = vertical ? await openBoard(browser, scene) : null;
  try {
    await context.addInitScript((config) => (window.__videoConfig = config), {
      fps: scene.fps,
      width: app.width,
      height: app.height,
      // 縦型では、字幕はアプリのページではなく台紙に描く
      captions: vertical ? [] : (scene.captions ?? []),
      captionBand: scene.captionBand,
      camera: scene.camera ?? [],
      seed: scene.seed,
      randomMode: scene.randomMode,
      hide: scene.hide ?? []
    });
    await context.addInitScript(OVERLAY);
    const replay = await installReplay(context, recording, {
      apiPrefix: scene.apiPrefix ?? "/api/",
      wsPattern: scene.wsPattern ? new RegExp(scene.wsPattern) : null,
      responseDelayFrames: scene.responseDelayFrames ?? 0
    });
    const page = await context.newPage();
    // 通信が静かになるまで待つ。quiet 回続けて通信が無ければ、静かになったとみなす
    const settle = async (quiet = 1) => {
      let calm = 0;
      for (let i = 0; i < 200 && calm < quiet; i++) {
        const before = replay.state.activity;
        await page.waitForTimeout(60);
        calm = replay.state.activity === before ? calm + 1 : 0;
      }
    };
    await page.clock.install({ time: CLOCK_START });
    await page.goto(origin + (scene.url ?? "/"), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await settle(10);
    await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 60_000));
    await settle(10);

    const actions = [...scene.actions].sort((a, b) => a.at - b.at);
    const streamFrom = actions.find((a) => a.type === "stream");
    const lead = scene.leadFrames ?? 0;
    for (let f = -lead; f < to; f++) {
      if (f > -lead) await page.clock.runFor(1000 / scene.fps);
      for (const a of actions) {
        if (a.at !== f && a.type !== "type") continue;
        if (a.type === "click") {
          if (a.send) replay.beginPost();
          await page.click(a.selector);
        }
        if (a.type === "press") {
          if (a.send) replay.beginPost();
          await page.keyboard.press(a.key);
        }
        if (a.type === "type") {
          const i = (f - a.at) / (a.every ?? 2);
          if (Number.isInteger(i) && i >= 0 && i < [...a.text].length) await page.keyboard.type([...a.text][i]);
        }
      }
      replay.tick(f);
      if (streamFrom && f >= streamFrom.at && (f - streamFrom.at) % (streamFrom.every ?? 1) === 0) await replay.releaseStreams(streamFrom.perFrame ?? 1);
      await settle();
      await page.evaluate((n) => {
        window.__setFrame(n);
        window.__syncAnimations(n);
      }, f);
      if (f < from) {
        await drawFrame(page);
        continue;
      }
      if (!vertical) {
        if (onFrame !== undefined) await onFrame(f, page);
        if (!shoot(f)) {
          await drawFrame(page);
          continue;
        }
        await onShot(f, await page.screenshot({ animations: "allow", caret: "hide" }), page);
        continue;
      }
      // 縦型: アプリの絵を撮り、台紙の窓に置いて、台紙を撮る。合格試験が測るのは台紙のページ
      const appPng = await page.screenshot({ animations: "allow", caret: "hide" });
      const cap = (scene.captions ?? []).find(([a, b]) => f >= a && f < b);
      await board.update(appPng, cap ? cap[2] : null);
      if (onFrame !== undefined) await onFrame(f, board.page);
      if (!shoot(f)) {
        await drawFrame(board.page);
        continue;
      }
      await onShot(f, await board.page.screenshot({ animations: "allow", caret: "hide" }), board.page);
    }
    return { misses: [...new Set(replay.state.misses)] };
  } finally {
    await context.close();
    if (board) await board.close();
  }
}
