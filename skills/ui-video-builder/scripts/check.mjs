#!/usr/bin/env node
// 合格試験。生成した動画の仕組みが、決まった品質を満たすかを確かめる。
// このファイルは生成させず、ui-video-builder のスキルが配る決まった物として使う。中身を書き換えない。
//
// 使い方:
//   node check.mjs --adapter <撮る関数のファイル> [--video 名前,名前] [--check same,blank,safe] [--repeat 3]
//
// 撮る関数のファイル(adapter)は、生成した仕組みの側が用意する。約束は references/acceptance.md にある。
//   export function videos(): Video[]
//   export async function shoot(opts): Promise<void>
//   export async function setup?(): Promise<{ close(): Promise<void> }>
//
// 確かめること:
//   same   場面ごとに中ほどの1コマを、別々のページで3回(--repeat で変えられる)撮り、PNG のバイト列が一致するか。
//          まれにしか起きない揺れを見逃さないため、2回ではなく3回撮る
//   blank  縦型の動画で、0.25秒ごとに撮り、絵の範囲が空のコマ(平らな升が6割を超える)が無いか。
//          強調の印(data-video-emphasis)が、絵の範囲の端から24pxの内側に収まるか
//   safe   縦型の動画で、字幕・見出し・注記・ロゴが TikTok の安全域に収まるか
//
// 依存は Node の標準の部品だけにする。画像の復号は、adapter が渡すページの中で行う。

import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

// ---- 決まった値 ----------------------------------------------------------

/** 空のコマを確かめる間隔(秒)。 */
const BLANK_SECONDS = 0.25;
/** 升の大きさ(px)。 */
const CELL = 64;
/** 平らな升とみなす、明るさ(0〜255)の標準偏差の上限。 */
const FLAT_STD = 3;
/** 空のコマとみなす、平らな升の割合の下限。 */
const BLANK_RATIO = 0.6;
/** 強調の印と、絵の範囲の端の間に残す余白(px)。 */
const EMPHASIS_MARGIN = 24;
/** 安全域を確かめる間隔(コマ)。 */
const SAFE_EVERY = 10;

/**
 * TikTok の In-Feed 広告の安全域を、1080×1920 に換算した値。文字を置く範囲で、絵を切る範囲ではない。
 * 上240px(タブ)、下660px(説明文・ユーザー名・音源名)、左右120px を空ける。
 * 右のボタンの列(いいね・コメント・共有)は、上から840pxより下で、右端から180pxの幅を使わない。
 */
const TIKTOK = {
  stage: { width: 1080, height: 1920 },
  safe: { x: 120, y: 240, width: 840, height: 1020 },
  buttons: { top: 840, width: 180 }
};

/** 安全域に収める要素の印と、報告に使う呼び名。 */
const GUARDED = {
  "data-video-caption": "字幕",
  "data-video-subtitle": "字幕",
  "data-video-heading": "見出し",
  "data-video-legal-note": "注記",
  "data-video-dev-note": "断り",
  "data-video-logo": "ロゴ"
};

// ---- ページの中で動かす関数 ----------------------------------------------

/** 強調の印の矩形と、祖先の切り落としで切れているかを集める。見えない印は除く。矩形はページの px。 */
function emphasisRects() {
  const out = [];
  for (const el of document.querySelectorAll("[data-video-emphasis]")) {
    let o = 1;
    for (let a = el; a !== null; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
    if (o < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let a = el.parentElement; a !== null; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const c = a.getBoundingClientRect();
      v = {
        left: Math.max(v.left, c.left),
        top: Math.max(v.top, c.top),
        right: Math.min(v.right, c.right),
        bottom: Math.min(v.bottom, c.bottom)
      };
    }
    if (v.right <= v.left || v.bottom <= v.top) continue;
    const clipped =
      v.left > r.left + 0.5 || v.top > r.top + 0.5 || v.right < r.right - 0.5 || v.bottom < r.bottom - 0.5;
    out.push({ x: r.left, y: r.top, width: r.width, height: r.height, clipped });
  }
  return out;
}

/**
 * 安全域に収める要素の矩形を集める。文字の要素は文字の範囲、ロゴは要素の範囲。
 * 値が "bottom" の印は、TikTok の部品に隠れてよい置き方として数えない。ロゴの中の文字は、ロゴと一緒に数える。
 */
function guardedRects(kinds) {
  const opacity = (el) => {
    let o = 1;
    for (let a = el; a !== null; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
    return o;
  };
  const out = [];
  for (const [attr, kind] of Object.entries(kinds)) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      if (opacity(el) < 0.05) continue;
      if (el.getAttribute(attr) === "bottom") continue;
      if (attr !== "data-video-logo" && el.closest("[data-video-logo]") !== null) continue;
      let r;
      if (attr === "data-video-logo") r = el.getBoundingClientRect();
      else {
        const range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect();
      }
      if (r.width === 0 || r.height === 0) continue;
      out.push({ attr, kind, text: el.textContent.slice(0, 20), x: r.x, y: r.y, width: r.width, height: r.height });
    }
  }
  return out;
}

/** PNG の、region の範囲の平らな升の割合を返す。ページの中で復号する。 */
async function flatRatio(page, png, region) {
  return page.evaluate(
    async ({ b64, region, CELL, FLAT_STD }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const { data, width } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      let flat = 0;
      let cells = 0;
      for (let y0 = region.y; y0 + CELL <= region.y + region.height; y0 += CELL) {
        for (let x0 = region.x; x0 + CELL <= region.x + region.width; x0 += CELL) {
          let sum = 0;
          let sq = 0;
          for (let y = y0; y < y0 + CELL; y++) {
            for (let x = x0; x < x0 + CELL; x++) {
              const i = (y * width + x) * 4;
              const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              sum += l;
              sq += l * l;
            }
          }
          const n = CELL * CELL;
          const mean = sum / n;
          const std = Math.sqrt(Math.max(0, sq / n - mean * mean));
          cells++;
          if (std < FLAT_STD) flat++;
        }
      }
      return flat / cells;
    },
    { b64: png.toString("base64"), region, CELL, FLAT_STD }
  );
}

// ---- 動画の情報 ----------------------------------------------------------

/** 前の場面の絵を続ける場面(continues)をまとめ、ページを開き直さずに続けて撮る区間に分ける。 */
function runsOf(video) {
  const runs = [];
  for (const s of video.scenes) {
    const end = s.from + s.durationInFrames;
    const last = runs[runs.length - 1];
    if (s.continues === true && last !== undefined) last.to = end;
    else runs.push({ from: s.from, to: end });
  }
  return runs;
}

/** 動画の px で数えた、ページの px 1つ分の大きさ。 */
const scaleOf = (video) => video.pageScale ?? 1;

/** 縦型か。 */
const isVertical = (video) => video.vertical ?? video.height > video.width;

/** 絵の範囲。省くと動画の全体。 */
const pictureOf = (video) => video.picture ?? { x: 0, y: 0, width: video.width, height: video.height };

/** 動画の大きさに合わせた TikTok の安全域。 */
function safeZoneOf(video) {
  const kx = video.width / TIKTOK.stage.width;
  const ky = video.height / TIKTOK.stage.height;
  return {
    safe: { x: TIKTOK.safe.x * kx, y: TIKTOK.safe.y * ky, width: TIKTOK.safe.width * kx, height: TIKTOK.safe.height * ky },
    buttonsTop: TIKTOK.buttons.top * ky,
    buttonsLeft: video.width - TIKTOK.buttons.width * kx
  };
}

function inSafeZone(r, zone) {
  const right = r.x + r.width;
  const bottom = r.y + r.height;
  const inside =
    r.x >= zone.safe.x &&
    r.y >= zone.safe.y &&
    right <= zone.safe.x + zone.safe.width &&
    bottom <= zone.safe.y + zone.safe.height;
  const onButtons = bottom > zone.buttonsTop && right > zone.buttonsLeft;
  return inside && !onButtons;
}

/** 印ごとに、安全域の代わりに置いてよい範囲を adapter が決めている場合はそれを使う。縁の端数は1pxまで許す。 */
function inAllowed(r, area) {
  return (
    r.x >= area.x - 1 && r.y >= area.y - 1 && r.x + r.width <= area.x + area.width + 1 && r.y + r.height <= area.y + area.height + 1
  );
}

const sec = (frame, video) => (frame / video.fps).toFixed(2);

// ---- 確かめる ------------------------------------------------------------

/** 2つの PNG の、色の値の差の最大と、違う範囲を返す。ページの中で復号する。 */
async function pngDiff(page, a, b) {
  return page.evaluate(
    async ({ a64, b64 }) => {
      const decode = async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [x, y] = await Promise.all([decode(a64), decode(b64)]);
      if (x.width !== y.width || x.height !== y.height) return { max: 255, box: null, sizeDiffers: true };
      let max = 0;
      let box = null;
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]), Math.abs(x.data[i + 3] - y.data[i + 3]));
        if (d === 0) continue;
        if (d > max) max = d;
        const p = i / 4;
        const px = p % x.width;
        const py = Math.floor(p / x.width);
        box = box === null ? { left: px, top: py, right: px, bottom: py } : { left: Math.min(box.left, px), top: Math.min(box.top, py), right: Math.max(box.right, px), bottom: Math.max(box.bottom, py) };
      }
      return { max, box };
    },
    { a64: a.toString("base64"), b64: b.toString("base64") }
  );
}

async function checkSame(adapter, video, repeat) {
  const runs = runsOf(video);
  let mismatches = 0;
  for (const s of video.scenes) {
    const frame = s.from + Math.floor(s.durationInFrames / 2);
    const from = runs.findLast((r) => r.from <= s.from).from;
    const shots = [];
    const diffs = [];
    for (let i = 0; i < repeat; i++) {
      await adapter.shoot({
        video: video.id,
        from,
        to: frame + 1,
        shoot: (f) => f === frame,
        onShot: async (_, png, page) => {
          shots.push(png);
          // 1回目と比べる。ページが開いている間に、ページの中で復号する
          if (shots.length > 1 && !shots[0].equals(png)) diffs.push(await pngDiff(page, shots[0], png));
        }
      });
    }
    if (shots.length !== repeat) throw new Error(`場面 ${s.id} のコマ ${frame} を${repeat}回撮れませんでした(撮れた数 ${shots.length})`);
    if (diffs.length === 0) {
      console.log(`一致  場面 ${s.id} のコマ ${frame}(${repeat}回)`);
      continue;
    }
    mismatches++;
    const worst = diffs.reduce((a, b) => (b.max > a.max ? b : a));
    const b = worst.box;
    console.log(
      `不一致  場面 ${s.id} のコマ ${frame}(${repeat}回のうち ${diffs.length}回が1回目と違う。色の値の差は最大 ${worst.max}${b ? `、範囲 x ${b.left}〜${b.right} y ${b.top}〜${b.bottom}` : "、大きさが違う"})`
    );
  }
  console.log(`同じコマ: ${video.scenes.length} コマのうち、不一致は ${mismatches} コマ`);
  return mismatches;
}

function blankSample(frame, fps) {
  const step = BLANK_SECONDS * fps;
  return Math.round(Math.round(frame / step) * step) === frame;
}

async function checkBlank(adapter, video) {
  const blanks = [];
  const overflows = [];
  let checked = 0;
  const k = scaleOf(video);
  const pic = pictureOf(video);
  const exempt = new Set(video.blankExemptScenes ?? []);
  const inner = {
    left: pic.x + EMPHASIS_MARGIN,
    top: pic.y,
    right: pic.x + pic.width - EMPHASIS_MARGIN,
    bottom: pic.y + pic.height - EMPHASIS_MARGIN
  };
  for (const run of runsOf(video)) {
    await adapter.shoot({
      video: video.id,
      from: run.from,
      to: run.to,
      shoot: (f) => blankSample(f, video.fps),
      onShot: async (frame, png, page) => {
        checked++;
        const scene = video.scenes.findLast((sc) => sc.from <= frame);
        const ratio = await flatRatio(page, png, pic);
        if (ratio > BLANK_RATIO && !exempt.has(scene?.id ?? "")) blanks.push({ frame, ratio, scene: scene?.id });
        for (const r of await page.evaluate(emphasisRects)) {
          const x = r.x * k;
          const y = r.y * k;
          const right = x + r.width * k;
          const bottom = y + r.height * k;
          if (!r.clipped && x >= inner.left && y >= inner.top && right <= inner.right && bottom <= inner.bottom) continue;
          overflows.push({ frame, x, y, right, bottom, clipped: r.clipped });
        }
      }
    });
  }
  for (const b of blanks.sort((a, c) => a.frame - c.frame))
    console.log(`空のコマ  ${sec(b.frame, video)} 秒(コマ ${b.frame}、場面 ${b.scene}) 平らな升の割合 ${b.ratio.toFixed(2)}`);
  console.log(`空のコマ: ${checked} コマを確かめ、空のコマは ${blanks.length} コマ(しきい値 ${BLANK_RATIO})`);
  for (const o of overflows)
    console.log(
      `はみ出し  ${sec(o.frame, video)} 秒(コマ ${o.frame}) x ${o.x.toFixed(0)}〜${o.right.toFixed(0)} y ${o.y.toFixed(0)}〜${o.bottom.toFixed(0)}${o.clipped ? " 切れている" : ""}`
    );
  const overflowFrames = new Set(overflows.map((o) => o.frame)).size;
  console.log(`はみ出し: ${checked} コマを確かめ、強調の印が絵の範囲の余白(${EMPHASIS_MARGIN}px)の内側に収まらないコマは ${overflowFrames} コマ`);
  return blanks.length + overflowFrames;
}

async function checkSafe(adapter, video) {
  let outside = 0;
  let checked = 0;
  const k = scaleOf(video);
  const zone = safeZoneOf(video);
  const allowed = video.allowedAreas ?? {};
  const kinds = { ...GUARDED, ...Object.fromEntries(Object.keys(allowed).map((a) => [a, a])) };
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const run of runsOf(video)) {
    const want = new Set();
    for (let f = run.from; f < run.to; f++) if ((f - run.from) % SAFE_EVERY === 0 || f === run.to - 1) want.add(f);
    await adapter.shoot({
      video: video.id,
      from: run.from,
      to: run.to,
      shoot: () => false,
      onShot: () => {},
      onFrame: async (frame, page) => {
        if (!want.has(frame)) return;
        checked++;
        const rects = (await page.evaluate(guardedRects, kinds)).map((r) => ({
          ...r,
          x: r.x * k,
          y: r.y * k,
          width: r.width * k,
          height: r.height * k
        }));
        for (const r of rects) {
          const area = allowed[r.attr];
          if (area ? inAllowed(r, area) : inSafeZone(r, zone)) continue;
          outside++;
          console.log(`安全域の外  コマ ${frame} の${r.kind}「${r.text}」 x ${r.x.toFixed(0)} y ${r.y.toFixed(0)} 幅 ${r.width.toFixed(0)} 高さ ${r.height.toFixed(0)}`);
        }
        // 注記は、字幕・見出し・ロゴと重ならない
        for (const note of rects.filter((r) => r.attr === "data-video-legal-note"))
          for (const r of rects) {
            if (r.attr === "data-video-legal-note" || r.attr === "data-video-dev-note") continue;
            if (!overlaps(note, r)) continue;
            outside++;
            console.log(`注記と重なる  コマ ${frame} の${r.kind}「${r.text}」`);
          }
      }
    });
  }
  console.log(`安全域: ${checked} コマを確かめ、外に出た要素と、注記に重なった要素は ${outside} 個`);
  return outside;
}

// ---- 本体 ----------------------------------------------------------------

function validate(video) {
  const need = ["id", "fps", "width", "height", "scenes"];
  for (const key of need) if (video[key] === undefined) throw new Error(`videos() の動画に ${key} がありません: ${JSON.stringify(video).slice(0, 120)}`);
  for (const s of video.scenes)
    for (const key of ["id", "from", "durationInFrames"])
      if (s[key] === undefined) throw new Error(`動画 ${video.id} の場面に ${key} がありません`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      adapter: { type: "string" },
      video: { type: "string" },
      check: { type: "string" },
      repeat: { type: "string" }
    }
  });
  if (!values.adapter) throw new Error("--adapter に撮る関数のファイルを渡してください");
  const adapter = await import(pathToFileURL(path.resolve(values.adapter)).href);
  for (const fn of ["videos", "shoot"])
    if (typeof adapter[fn] !== "function") throw new Error(`adapter に ${fn} がありません`);
  const all = await adapter.videos();
  all.forEach(validate);
  const names = values.video ? values.video.split(",") : all.map((v) => v.id);
  const checks = (values.check ?? "same,blank,safe").split(",");
  const handle = typeof adapter.setup === "function" ? await adapter.setup() : null;
  const failures = [];
  try {
    for (const name of names) {
      const video = all.find((v) => v.id === name);
      if (!video) throw new Error(`動画 ${name} は videos() にありません`);
      console.log(`\n== ${video.id}(${video.width}×${video.height}、${video.fps}fps、場面 ${video.scenes.length})`);
      if (checks.includes("same")) {
        const n = await checkSame(adapter, video, Math.max(2, Number(values.repeat ?? 3)));
        if (n > 0) failures.push(`${video.id}: 2回の撮影で一致しないコマが ${n} コマ`);
      }
      // 空のコマは、縦型の動画で確かめる。横型は、動画の設定に blank: true があるときだけ確かめる
      if (checks.includes("blank") && (isVertical(video) || video.blank === true)) {
        const n = await checkBlank(adapter, video);
        if (n > 0) failures.push(`${video.id}: 空のコマと、強調の印がはみ出したコマが合わせて ${n} コマ`);
      }
      if (checks.includes("safe") && isVertical(video)) {
        const n = await checkSafe(adapter, video);
        if (n > 0) failures.push(`${video.id}: 安全域の外に出た要素が ${n} 個`);
      }
    }
  } finally {
    if (handle) await handle.close();
  }
  if (failures.length > 0) {
    console.error(`\n不合格\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\n合格");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
