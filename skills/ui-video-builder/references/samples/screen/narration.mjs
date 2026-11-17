// 画面の作り方の見本: ナレーションの時刻と、字幕の SRT を決める部品。narrate.mjs と render.mjs が使う。
//
// 場面の設定の narration は、次の形の並び。
//   { id: "ask", at: 10, text: "画面に出す文", say: "読み上げ用の文(省ける。漢字の読みを仮名で直すとき)" }
//   { id: "answer", after: "ask", gap: 6, text: "..." }   // after の発話が終わってから gap コマ後に話し始める
// 発話の長さは、narrate.mjs が作った video/narration/<動画>.json から読む。文を変えて音声を作り直すと、
// after でつないだ発話の時刻も自動でずれる。操作の時刻を発話に合わせたいときは、場面の設定でこの部品を使って計算する。
import fs from "node:fs";
import path from "node:path";

/** 発話の長さの記録を読む。無ければ空 */
export function readNarrationMeta(dir, video) {
  const file = path.join(dir, `${video}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** 発話ごとに、話し始めるコマ(at)と長さ(frames)を決める。長さの分からない発話は、文の字数から仮に決める */
export function scheduleNarration(scene, meta) {
  const out = [];
  const byId = new Map();
  for (const n of scene.narration ?? []) {
    const frames = meta[n.id]?.frames ?? Math.ceil(([...(n.say ?? n.text)].length / 7) * scene.fps);
    let at = n.at;
    if (at === undefined) {
      const prev = byId.get(n.after);
      if (prev === undefined) throw new Error(`発話 ${n.id} の after(${n.after})が、前に無い`);
      at = prev.at + prev.frames + (n.gap ?? 0);
    }
    const item = { ...n, at, frames, file: meta[n.id]?.file ?? null };
    out.push(item);
    byId.set(n.id, item);
  }
  return out;
}

const stamp = (frame, fps) => {
  const ms = Math.round((frame / fps) * 1000);
  const p = (n, w) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
};

/** 字幕の SRT を作る。ナレーションがあれば発話の文を、無ければ場面の字幕を出す */
export function toSrt(scene, schedule) {
  const items = schedule.length > 0 ? schedule.map((n) => [n.at, n.at + n.frames, n.text]) : (scene.captions ?? []);
  return items.map(([from, to, text], i) => `${i + 1}\n${stamp(from, scene.fps)} --> ${stamp(to, scene.fps)}\n${String(text).replace(/\\n/g, "\n")}\n`).join("\n");
}
