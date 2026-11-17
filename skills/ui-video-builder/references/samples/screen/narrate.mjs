// 画面の作り方の見本: ナレーションの音声を ElevenLabs で作り、発話の長さを記録する。
//   ELEVENLABS_API_KEY=... node video/narrate.mjs --video demo [--only ask,answer] [--voice <声の id>]
//
// 音声の生成は課金される。流す前に、何本の発話を作り直すかを利用者に伝えて確かめる。
// 文(読み上げ用の文 say があればそれ)が前と同じ発話は、作り直さない。
// 作り直す発話の前の音声は、上書きせず video/narration/<動画>/before-<日時>/ へ移す。
// 声の id は --voice、場面の設定の voice、環境変数 ELEVENLABS_VOICE_ID の順に読む。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readNarrationMeta } from "./narration.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "narration");
const { values } = parseArgs({ options: { video: { type: "string" }, only: { type: "string" }, voice: { type: "string" } } });
const scene = (await import(pathToFileURL(path.join(HERE, "scenes", `${values.video}.mjs`)).href)).default;
const voice = values.voice ?? scene.voice ?? process.env.ELEVENLABS_VOICE_ID;
if (!voice) throw new Error("声の id を --voice か、場面の設定の voice か、ELEVENLABS_VOICE_ID で渡してください");

const meta = readNarrationMeta(DIR, scene.id);
const only = values.only ? new Set(values.only.split(",")) : null;
const outDir = path.join(DIR, scene.id);
fs.mkdirSync(outDir, { recursive: true });
const keepDir = path.join(outDir, `before-${new Date().toISOString().replace(/[:.]/g, "-")}`);
// 作り直す発話を先に数える。無ければ、鍵を求めずに終わる
const todo = [];
for (const n of scene.narration ?? []) {
  if (only && !only.has(n.id)) continue;
  const speak = n.say ?? n.text;
  const digest = crypto.createHash("sha1").update(`${voice}\n${scene.voiceModel ?? ""}\n${speak}`).digest("hex");
  const file = path.join(outDir, `${n.id}.mp3`);
  if (meta[n.id]?.digest === digest && fs.existsSync(file)) continue;
  todo.push({ n, speak, digest, file });
}
if (todo.length === 0) {
  console.log("作り直す発話はありません。文と声が前と同じです");
  process.exit(0);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error(`作り直す発話が ${todo.length} 本あります(${todo.map((t) => t.n.id).join(", ")})。ELEVENLABS_API_KEY に ElevenLabs の鍵を入れてください`);
let made = 0;
for (const { n, speak, digest, file } of todo) {
  if (fs.existsSync(file)) {
    fs.mkdirSync(keepDir, { recursive: true });
    fs.renameSync(file, path.join(keepDir, `${n.id}.mp3`));
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: speak, model_id: scene.voiceModel ?? "eleven_multilingual_v2", ...(scene.voiceSettings && { voice_settings: scene.voiceSettings }) })
  });
  if (!res.ok) throw new Error(`ElevenLabs が ${res.status} を返しました: ${await res.text()}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  meta[n.id] = { digest, file: path.relative(process.cwd(), file), seconds, frames: Math.ceil(seconds * scene.fps) };
  made++;
  console.log(`作った: ${n.id}(${seconds.toFixed(2)} 秒)「${speak}」`);
}
fs.writeFileSync(path.join(DIR, `${scene.id}.json`), JSON.stringify(meta, null, 1));
console.log(`作り直した発話: ${made} 本。長さの記録: ${path.join(DIR, `${scene.id}.json`)}`);
