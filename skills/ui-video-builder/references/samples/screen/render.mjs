// 画面の作り方の見本: 場面を全コマ撮り、ffmpeg で mp4 にする。
//   VIDEO_ORIGIN=http://localhost:<アプリの開発サーバーのポート> node video/render.mjs --video demo
// 出力は out/video/<id>.mp4 と、字幕の out/video/<id>.srt。同じ名前のファイルがあれば、上書きする前に out/video/before-<日時>/ へ移す。
// 場面の設定に narration があれば、narrate.mjs が作った音声を発話の時刻に重ねる。sounds の効果音も、決めたコマに重ねる。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BROWSER_ARGS, shootScene } from "./shoot.mjs";
import { readNarrationMeta, scheduleNarration, toSrt } from "./narration.mjs";

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
const srt = path.join(values.out, `${values.video}.srt`);
const keep = path.join(values.out, `before-${new Date().toISOString().replace(/[:.]/g, "-")}`);
for (const f of [mp4, srt]) {
  if (!fs.existsSync(f)) continue;
  fs.mkdirSync(keep, { recursive: true });
  fs.renameSync(f, path.join(keep, path.basename(f)));
  console.log(`前の版を ${keep} へ移した: ${path.basename(f)}`);
}
// 音: ナレーションと効果音を、決めたコマの時刻に置いて混ぜる
const schedule = scheduleNarration(scene, readNarrationMeta(path.join(HERE, "narration"), scene.id));
const missing = schedule.filter((n) => n.file === null).map((n) => n.id);
if (missing.length > 0) console.warn(`音声の無い発話: ${missing.join(", ")}。narrate.mjs で作ると、音と時刻が入る`);
const clips = [
  ...schedule.filter((n) => n.file !== null).map((n) => ({ at: n.at, file: n.file, volume: 1 })),
  ...(scene.sounds ?? []).map((x) => ({ at: x.at, file: x.file, volume: x.volume ?? 0.6 }))
];
const args = ["-y", "-loglevel", "error", "-framerate", String(scene.fps), "-i", path.join(framesDir, "%05d.png")];
for (const c of clips) args.push("-i", c.file);
if (clips.length > 0) {
  const parts = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round((c.at / scene.fps) * 1000)}:all=1,volume=${c.volume}[a${i}]`);
  args.push("-filter_complex", `${parts.join(";")};${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0[aout]`, "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
}
args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(total / scene.fps), mp4);
execFileSync("ffmpeg", args);
fs.writeFileSync(srt, toSrt(scene, schedule));
console.log(`撮った: ${mp4}(${total}コマ、音 ${clips.length} 本)と ${srt}`);
