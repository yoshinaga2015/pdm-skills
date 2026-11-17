// 部品の作り方の見本: 合格試験に渡す撮る関数のファイル。約束は references/acceptance.md にある。
// 動画の一覧(場面の並びと大きさ)は、描く側と同じ構成のファイルから読む。動画の入口の URL は VIDEO_ORIGIN で渡す。
//   VIDEO_ORIGIN=http://localhost:5174 node <スキル>/scripts/check.mjs --adapter video/check-adapter.mjs
import { chromium } from "playwright";
import { COMPOSITIONS } from "./composition.mjs"; // { id: { id, fps, width, height, scenes } } の形にする
import { shootRun } from "./shoot.mjs";

let browser = null;

export function videos() {
  return Object.values(COMPOSITIONS);
}

export async function setup() {
  browser = await chromium.launch();
  return { close: () => browser.close() };
}

export async function shoot({ video, from, to, shoot: want, onShot, onFrame }) {
  const c = COMPOSITIONS[video];
  const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light" });
  try {
    const page = await context.newPage();
    await shootRun(page, `${process.env.VIDEO_ORIGIN}/video.html?v=${video}`, { from, to, shoot: want, onShot, onFrame });
  } finally {
    await context.close();
  }
}
