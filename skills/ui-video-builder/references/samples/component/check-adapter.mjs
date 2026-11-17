// 部品の作り方の見本: 合格試験に渡す撮る関数のファイル。約束は references/acceptance.md にある。
// 動画の一覧(場面の並びと大きさ)は、描く側と同じ構成のファイルから読む。動画の入口の URL は VIDEO_ORIGIN で渡す。
//   VIDEO_ORIGIN=http://localhost:5174 node <スキル>/scripts/check.mjs --adapter video/check-adapter.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { COMPOSITIONS } from "./composition.mjs"; // { id: { id, fps, width, height, scenes } } の形にする
import { shootRun } from "./shoot.mjs";

// 強調の印・カーソル・題名の札などを使うときは、画面の作り方の overlay.js を同じ置き場に写し、
// 動画の構成に overlay: { marks, cursor, cards, notes, ... } を書く。形は overlay.js の6節
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = fs.existsSync(path.join(HERE, "overlay.js")) ? fs.readFileSync(path.join(HERE, "overlay.js"), "utf8") : null;
// chromium を起動するときの引数。部分の描き直しを止める(references/principles.md の1節)
const BROWSER_ARGS = ["--disable-partial-raster"];

let browser = null;

export function videos() {
  return Object.values(COMPOSITIONS).map((c) => ({
    ...c,
    marks: (c.overlay?.marks ?? []).length > 0,
    cues: (c.sounds ?? []).filter((x) => x.kind !== undefined).map((x) => ({ frame: x.at, kind: x.kind, mark: x.mark }))
  }));
}

export async function setup() {
  browser = await chromium.launch({ args: BROWSER_ARGS });
  return { close: () => browser.close() };
}

export async function shoot({ video, from, to, shoot: want, onShot, onFrame }) {
  const c = COMPOSITIONS[video];
  const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light" });
  try {
    if (OVERLAY !== null && c.overlay !== undefined) {
      await context.addInitScript((config) => (window.__videoConfig = config), { ...c.overlay, mode: "component", fps: c.fps, width: c.width, height: c.height });
      await context.addInitScript(OVERLAY);
    }
    const page = await context.newPage();
    await shootRun(page, `${process.env.VIDEO_ORIGIN}/video.html?v=${video}`, { from, to, shoot: want, onShot, onFrame });
  } finally {
    await context.close();
  }
}
