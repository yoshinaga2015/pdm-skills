// 画面の作り方の見本: 場面を全コマ撮り、ffmpeg で mp4 にする。
//   VIDEO_ORIGIN=http://localhost:<アプリの開発サーバーのポート> node video/render.mjs --video demo
// 出力は out/video/<id>.mp4。同じ名前のファイルがあれば、上書きする前に out/video/before-<日時>/ へ移す。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BROWSER_ARGS, shootScene } from "./shoot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { video: { type: "string" }, out: { type: "string", default: "out/video" } } });
const scene = (await import(pathToFileURL(path.join(HERE, "scenes", `${values.video}.mjs`)).href)).default;
const recording = JSON.parse(fs.readFileSync(path.join(HERE, "recordings", `${values.video}.json`), "utf8"));
const total = scene.scenes.reduce((n, s) => Math.max(n, s.from + s.durationInFrames), 0);
const framesDir = path.join(values.out, "frames", values.video);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({ args: BROWSER_ARGS });
try {
  const { misses } = await shootScene(browser, {
    origin: process.env.VIDEO_ORIGIN,
    scene,
    recording,
    to: total,
    onShot: async (f, png) => fs.writeFileSync(path.join(framesDir, `${String(f).padStart(5, "0")}.png`), png)
  });
  if (misses.length > 0) console.warn(`録った応答が見つからない要求: ${misses.join(" / ")}`);
} finally {
  await browser.close();
}
const mp4 = path.join(values.out, `${values.video}.mp4`);
if (fs.existsSync(mp4)) {
  const keep = path.join(values.out, `before-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(keep, { recursive: true });
  fs.renameSync(mp4, path.join(keep, path.basename(mp4)));
  console.log(`前の版を ${keep} へ移した`);
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(scene.fps), "-i", path.join(framesDir, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4]);
console.log(`撮った: ${mp4}(${total}コマ)`);
