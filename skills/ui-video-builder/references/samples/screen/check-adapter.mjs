// 画面の作り方の見本: 合格試験に渡す撮る関数のファイル。約束は references/acceptance.md にある。
// 場面の設定は SCENES_DIR の *.mjs、録った通信は RECORDINGS_DIR の <id>.json から読む。
// アプリの開発サーバーの URL は、環境変数 VIDEO_ORIGIN で渡す。
//   VIDEO_ORIGIN=http://localhost:<アプリの開発サーバーのポート> node <スキル>/scripts/check.mjs --adapter video/check-adapter.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BROWSER_ARGS, shootScene } from "./shoot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = path.join(HERE, "scenes");
const RECORDINGS_DIR = path.join(HERE, "recordings");

const scenes = await Promise.all(
  fs
    .readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith(".mjs"))
    .map(async (f) => (await import(pathToFileURL(path.join(SCENES_DIR, f)).href)).default)
);
let browser = null;

export function videos() {
  // 場面の設定に書いた、合格試験に渡す値(vertical、picture、blank、blankExemptScenes、allowedAreas)も渡す
  return scenes.map((s) => ({
    id: s.id,
    fps: s.fps,
    width: s.width,
    height: s.height,
    scenes: s.scenes,
    vertical: s.vertical !== undefined,
    // 縦型は、空のコマを数える範囲を、アプリの絵を置いた窓にする。台紙の地の色を含めると必ず空と数える
    ...(s.vertical !== undefined && s.picture === undefined && { picture: s.vertical.window }),
    ...Object.fromEntries(["picture", "blank", "blankExemptScenes", "allowedAreas", "pageScale"].filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))
  }));
}

export async function setup() {
  if (!process.env.VIDEO_ORIGIN) throw new Error("VIDEO_ORIGIN にアプリの開発サーバーの URL を入れてください");
  browser = await chromium.launch({ args: BROWSER_ARGS });
  return { close: () => browser.close() };
}

export async function shoot({ video, from, to, shoot: want, onShot, onFrame }) {
  const scene = scenes.find((s) => s.id === video);
  const recording = JSON.parse(fs.readFileSync(path.join(RECORDINGS_DIR, `${video}.json`), "utf8"));
  const { misses } = await shootScene(browser, { origin: process.env.VIDEO_ORIGIN, scene, recording, from, to, shoot: want, onShot, onFrame });
  if (misses.length > 0) throw new Error(`録った応答が見つからない要求があります: ${misses.join(" / ")}`);
}
