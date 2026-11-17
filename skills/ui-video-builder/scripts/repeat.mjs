#!/usr/bin/env node
// 揺れの原因を絞る道具。同じコマを何回も撮り、1回目との色の値の差と、違う範囲を出す。合格試験とは別に使う。
//   node repeat.mjs --adapter <撮る関数のファイル> --video <名前> --frame <コマ> [--times 6] [--out <PNG を残すフォルダ>]
// 違う範囲が分かったら、その場所に何が描かれているかを PNG で見る。references/principles.md の1節の表で原因を探す。
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values } = parseArgs({ options: { adapter: { type: "string" }, video: { type: "string" }, frame: { type: "string" }, times: { type: "string" }, out: { type: "string" } } });
const adapter = await import(pathToFileURL(path.resolve(values.adapter)).href);
const frame = Number(values.frame);
const times = Number(values.times ?? 6);
const video = (await adapter.videos()).find((v) => v.id === values.video);
if (!video) throw new Error(`動画 ${values.video} は videos() にありません`);
// 前の場面の絵を続ける場面は、続けている区間の始めから撮る
let from = 0;
for (const s of video.scenes) if (s.from <= frame && s.continues !== true) from = s.from;
const handle = typeof adapter.setup === "function" ? await adapter.setup() : null;
const shots = [];
try {
  for (let i = 0; i < times; i++) {
    await adapter.shoot({
      video: video.id,
      from,
      to: frame + 1,
      shoot: (f) => f === frame,
      onShot: async (_, png, page) => {
        shots.push(png);
        if (values.out) {
          fs.mkdirSync(values.out, { recursive: true });
          fs.writeFileSync(path.join(values.out, `${video.id}-${frame}-${i + 1}.png`), png);
        }
        if (shots.length === 1) return;
        const r = await page.evaluate(
          async ({ a64, b64 }) => {
            const decode = async (s) => {
              const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type: "image/png" }));
              const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
              ctx.drawImage(bmp, 0, 0);
              return ctx.getImageData(0, 0, bmp.width, bmp.height);
            };
            const [x, y] = await Promise.all([decode(a64), decode(b64)]);
            let max = 0, count = 0, l = Infinity, t = Infinity, rr = -1, bb = -1;
            for (let i = 0; i < x.data.length; i += 4) {
              let d = 0;
              for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(x.data[i + k] - y.data[i + k]));
              if (d === 0) continue;
              count++;
              max = Math.max(max, d);
              const p = i / 4, px = p % x.width, py = Math.floor(p / x.width);
              l = Math.min(l, px); t = Math.min(t, py); rr = Math.max(rr, px); bb = Math.max(bb, py);
            }
            return count === 0 ? null : { max, count, box: [l, t, rr, bb] };
          },
          { a64: shots[0].toString("base64"), b64: png.toString("base64") }
        );
        console.log(r === null ? `${shots.length}回目: 1回目と一致` : `${shots.length}回目: 違う画素 ${r.count}、色の値の差は最大 ${r.max}、範囲 x ${r.box[0]}〜${r.box[2]} y ${r.box[1]}〜${r.box[3]}`);
      }
    });
  }
} finally {
  if (handle) await handle.close();
}
