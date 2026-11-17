// 画面の作り方の見本: ページに重ねる層。Playwright の addInitScript で、アプリのページに差し込む。
// アプリのコードは変えない。差し込む前に window.__videoConfig に動画の設定を入れておく(shoot.mjs)。
//
// することは6つ。
// 1. Math.random を、呼んだ場所ごとに決まった値を返すものに替える。アプリが乱数で選ぶ文や絵を、毎回同じにする
// 2. 撮るときに映したくないものを隠す。入力欄のカーソル、フレームワークの開発用の表示、config.hide の要素
// 3. 字幕を描く。動画の px で置くので、ページの拡大(カメラ)の影響を受けないよう html の直下に置く
// 4. カメラを描く。body を transform で拡大・移動する。寄る先は画面の全体か、要素の選択子で決める
// 5. CSS と SVG の動きを、コマの時刻にそろえる
// 6. 重ねる部品を描く。強調の印、早送りの札、マウスのカーソルとクリックの波紋、題名やロゴの札、注記。
//    どれもカメラの外側(html の直下)に描き、要素の位置はカメラを掛けた後の画面の位置で測る。
//    部品の作り方でも、この層を動画のページに差し込めば同じ部品が使える
//
// window.__setFrame(コマ) と window.__syncAnimations(コマ) を、撮るループが毎コマ呼ぶ。
// 部品の作り方では、動画の入口が自分の __setFrame と __syncAnimations を持つので、この層は
// window.__overlayFrame(コマ) だけを用意し、撮るループがそれも呼ぶ(config.mode を "component" にする)。
(() => {
  const config = window.__videoConfig ?? {};
  const FPS = config.fps ?? 30;
  const VIEW = { width: config.width ?? 1920, height: config.height ?? 1080 };

  // 1. 乱数。1つの種から順に値を出す作りは、フレームワークの開発用の道具も Math.random を呼ぶと、
  //    呼ぶ順がページを開くたびに変わって崩れる(Next.js の開発サーバーで起きた)。同じ場所が2回呼ばれるか
  //    4回呼ばれるかも変わる。そこで、呼んだ場所(呼び出し元のファイルと行と列)ごとに決まった値を返す。
  //    同じ場所で違う値が要るアプリ(ループで乱数を作るなど)は、config.randomMode を "sequence" にする
  const SEED = config.seed ?? 20261117;
  const hash = (text) => {
    let h = 2166136261 ^ SEED;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  };
  if (config.randomMode === "sequence") {
    let seed = SEED;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  } else {
    Math.random = () => {
      const caller = (new Error().stack ?? "").split("\n")[2] ?? "";
      // 開発サーバーが付ける版の印(?t=123、?v=abc)は、ページを開くたびに変わりうるので外す
      return hash(caller.replace(/\?[^:)\s]*/g, ""));
    };
  }

  // 2. 隠すもの。入力欄のカーソルの点滅はブラウザの中の時計で進み、偽の時計で止まらない。
  //    フレームワークの開発用の表示(Next.js の「Issue」の印、Vite のエラーの表示)は映さない
  const HIDE = ["nextjs-portal", "vite-error-overlay", ...(config.hide ?? [])];
  function ensureStyle() {
    if (document.getElementById("__video_style") !== null) return;
    const parent = document.head ?? document.documentElement;
    if (parent === null) return;
    const style = document.createElement("style");
    style.id = "__video_style";
    style.textContent = `* { caret-color: transparent !important; } ${HIDE.join(", ")} { display: none !important; }`;
    parent.appendChild(style);
  }
  if (document.documentElement === null) document.addEventListener("DOMContentLoaded", ensureStyle);
  else ensureStyle();

  // 3. 字幕。[始まりのコマ, 終わりのコマ, 文] の並び。帯の高さは BAND に固定し、カメラの計算と合わせる
  const CAPTIONS = config.captions ?? [];
  const BAND = CAPTIONS.length === 0 ? 0 : (config.captionBand ?? 96);
  let layer = null;
  let shownCaption = null;
  function captionLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement("div");
    layer.setAttribute("data-video-caption", "");
    // font の一括指定は line-height を既定に戻すので、font を先に書く
    layer.style.cssText = [
      "font:800 52px 'Hiragino Sans','Noto Sans JP',sans-serif",
      `line-height:${BAND}px`,
      `height:${BAND}px`,
      "position:fixed",
      "left:0",
      "right:0",
      "top:0",
      "z-index:2147483647",
      "pointer-events:none",
      "text-align:center",
      "white-space:nowrap",
      "overflow:hidden",
      "color:#fff",
      "background:rgba(15,23,42,.85)"
    ].join(";");
    document.documentElement.appendChild(layer);
    return layer;
  }

  // 4. カメラ。[始まりのコマ, 寄り終えるコマ, 寄る先] の並び。寄る先は次のどれか
  //    { full: true }                   画面の全体を、字幕の帯の下に収める
  //    { selector, pad, maxHeight, zoom, align } 要素に寄る。maxHeight は縦に長い要素の上の部分に絞る。
  //                                       zoom は拡大率を決める。横いっぱいの要素は、矩形から決めると拡大しない。
  //                                       align は "left" か "right"。要素の左端か右端を、画面の端にそろえる
  //                                       (左右の端に分かれた見出しの片側を見せるとき)
  const CAMERA = config.camera ?? [];
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  // 拡大する前のページの大きさと要素の矩形を測る。body の transform を外してから測り、元に戻す
  function measure(fn) {
    const body = document.body;
    const saved = body.style.transform;
    body.style.transform = "";
    try {
      return fn();
    } finally {
      body.style.transform = saved;
    }
  }
  function viewOf(target) {
    const avail = VIEW.height - BAND;
    const page = measure(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    let r;
    if (target.full === true || target.selector === undefined) r = { x: 0, y: 0, ...VIEW };
    else {
      const el = document.querySelector(target.selector);
      const b = el === null ? { x: 0, y: 0, ...VIEW } : measure(() => el.getBoundingClientRect());
      const pad = target.pad ?? 24;
      const height = b.height + pad * 2;
      r = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: target.maxHeight === undefined ? height : Math.min(height, target.maxHeight) };
    }
    const s = target.zoom ?? Math.min(VIEW.width / r.width, avail / r.height);
    // 寄る先の中心を、帯の下の範囲の中心に置く
    let x = r.x + r.width / 2 - VIEW.width / s / 2;
    let y = r.y + r.height / 2 - (BAND + avail / 2) / s;
    if (target.align === "left") x = r.x;
    if (target.align === "right") x = r.x + r.width - VIEW.width / s;
    // ページの外を映さない。映す幅がページより狭いときだけ、端で止める
    const w = VIEW.width / s;
    const h = avail / s;
    if (w <= page.width) x = Math.min(Math.max(x, 0), page.width - w);
    if (h <= page.height) y = Math.min(Math.max(y, -BAND / s), page.height - h - BAND / s);
    return { s, x, y };
  }
  function cameraAt(f) {
    let cur = null;
    for (const [from, to, target] of CAMERA) {
      if (f < from) break;
      const next = viewOf(target);
      if (cur === null) {
        cur = next;
        continue;
      }
      const t = to === from ? 1 : Math.min(1, (f - from) / (to - from));
      const e = easeOutExpo(t);
      cur = { s: cur.s + (next.s - cur.s) * e, x: cur.x + (next.x - cur.x) * e, y: cur.y + (next.y - cur.y) * e };
    }
    return cur ?? { s: 1, x: 0, y: 0 };
  }

  // 6. 重ねる部品。どれもコマの番号だけで描く。値は __videoConfig から読む
  //   marks:  [{ id, at, until, type, selector, pad, drawFrames }]
  //           type は "circle"(赤い丸) "box"(枠) "strike"(取り消し線) "highlight"(蛍光ペン)。at から drawFrames コマで描き、until で消す
  //   labels: [{ at, until, text, corner }]  早送りなどの札。corner は "top-right" など
  //   cursor: [{ at, selector, click, moveFrames }]  at のコマに要素の中心へ着くよう、moveFrames コマで動く。click で波紋
  //   cards:  [{ at, until, title, subtitle, logo, background }]  画面の全体を覆う題名やロゴの札。title は \n で行を分ける
  //   notes:  [{ at, until, text, kind }]  右下の小さな注記。kind は "legal"(法務の注記) か "dev"(開発中の断り)
  const MARKS = config.marks ?? [];
  const LABELS = config.labels ?? [];
  const CURSOR = config.cursor ?? [];
  const CARDS = config.cards ?? [];
  const NOTES = config.notes ?? [];
  const NS = "http://www.w3.org/2000/svg";
  let deck = null;
  function deckLayer() {
    if (deck && deck.isConnected) return deck;
    deck = document.createElement("div");
    deck.id = "__video_deck";
    deck.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none";
    document.documentElement.appendChild(deck);
    return deck;
  }
  // 手書き風の揺れ。印の id ごとに決まった値にする
  const wobble = (id, i) => (hash(`${id}:${i}`) - 0.5) * 2;
  function screenRect(selector, pad = 0) {
    const el = document.querySelector(selector);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  }
  function drawMarks(f, root) {
    for (const m of MARKS) {
      if (f < m.at || (m.until !== undefined && f >= m.until)) continue;
      const r = screenRect(m.selector, m.pad ?? 8);
      if (r === null) continue;
      const t = Math.min(1, (f - m.at) / (m.drawFrames ?? 8));
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", String(VIEW.width));
      svg.setAttribute("height", String(VIEW.height));
      svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible";
      const id = m.id ?? `${m.type}-${m.at}`;
      const color = m.color ?? (m.type === "box" ? "#2563eb" : "#e11d48");
      let shape;
      if (m.type === "highlight") {
        shape = document.createElementNS(NS, "rect");
        shape.setAttribute("x", String(r.x));
        shape.setAttribute("y", String(r.y));
        shape.setAttribute("width", String(r.width * t));
        shape.setAttribute("height", String(r.height));
        shape.setAttribute("fill", m.color ?? "rgba(250,204,21,.35)");
      } else {
        shape = document.createElementNS(NS, "path");
        let d;
        if (m.type === "circle") {
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const rx = r.width / 2 + 6;
          const ry = r.height / 2 + 6;
          const pts = [];
          // 1周と少し描き、始まりと終わりをずらして手書きに見せる
          for (let i = 0; i <= 48; i++) {
            const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
            const k = 1 + wobble(id, i) * 0.04;
            pts.push(`${cx + Math.cos(a) * rx * k},${cy + Math.sin(a) * ry * k}`);
          }
          d = `M${pts.join("L")}`;
        } else if (m.type === "strike") {
          const y = r.y + r.height / 2;
          d = `M${r.x},${y + wobble(id, 1) * 3}L${r.x + r.width},${y + wobble(id, 2) * 3}`;
        } else {
          d = `M${r.x},${r.y}L${r.x + r.width},${r.y}L${r.x + r.width},${r.y + r.height}L${r.x},${r.y + r.height}Z`;
        }
        shape.setAttribute("d", d);
        shape.setAttribute("fill", "none");
        shape.setAttribute("stroke", color);
        shape.setAttribute("stroke-width", String(m.width ?? (m.type === "strike" ? 6 : 5)));
        shape.setAttribute("stroke-linecap", "round");
        shape.setAttribute("stroke-linejoin", "round");
        shape.setAttribute("pathLength", "1");
        shape.setAttribute("stroke-dasharray", "1");
        shape.setAttribute("stroke-dashoffset", String(1 - t));
      }
      // 合格試験が読む印。外枠(はみ出しを測る)、id、種類、描き終えたか
      shape.setAttribute("data-video-emphasis", m.type);
      shape.setAttribute("data-video-mark", id);
      shape.setAttribute("data-video-mark-kind", m.type);
      shape.setAttribute("data-video-drawn", t >= 1 ? "1" : "0");
      svg.appendChild(shape);
      root.appendChild(svg);
    }
  }
  const CORNERS = {
    "top-right": "top:24px;right:32px",
    "top-left": "top:24px;left:32px",
    "bottom-right": "bottom:24px;right:32px",
    "bottom-left": "bottom:24px;left:32px"
  };
  function drawLabels(f, root) {
    for (const l of LABELS) {
      if (f < l.at || f >= l.until) continue;
      const el = document.createElement("div");
      el.textContent = l.text ?? "▶▶ 早送り";
      el.setAttribute("data-video-emphasis", "label");
      el.style.cssText = `position:absolute;${CORNERS[l.corner ?? "top-right"]};margin-top:${BAND}px;padding:10px 20px;border-radius:999px;background:rgba(15,23,42,.8);color:#fff;font:800 28px 'Hiragino Sans','Noto Sans JP',sans-serif`;
      root.appendChild(el);
    }
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function drawCursor(f, root) {
    if (CURSOR.length === 0) return;
    // f のコマで、どの要素からどの要素へ動いているかを決める
    let prev = null;
    let point = null;
    for (const c of CURSOR) {
      const r = screenRect(c.selector);
      if (r === null) continue;
      const target = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const start = c.at - (c.moveFrames ?? 12);
      if (f < start) break;
      const from = prev ?? { x: target.x + 160, y: target.y + 120 };
      const t = easeOutExpo(Math.min(1, (f - start) / (c.at - start)));
      point = { x: lerp(from.x, target.x, t), y: lerp(from.y, target.y, t), click: c.click && f >= c.at && f < c.at + 12 ? (f - c.at) / 12 : null };
      prev = target;
    }
    if (point === null) return;
    if (point.click !== null) {
      const ring = document.createElement("div");
      const size = 24 + point.click * 56;
      ring.setAttribute("data-video-tap", "");
      ring.style.cssText = `position:absolute;left:${point.x - size / 2}px;top:${point.y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;border:3px solid rgba(37,99,235,${1 - point.click});`;
      root.appendChild(ring);
    }
    const arrow = document.createElementNS(NS, "svg");
    arrow.setAttribute("width", "32");
    arrow.setAttribute("height", "40");
    arrow.setAttribute("viewBox", "0 0 32 40");
    arrow.setAttribute("data-video-cursor", "");
    arrow.style.cssText = `position:absolute;left:${point.x - 4}px;top:${point.y - 2}px`;
    arrow.innerHTML = '<path d="M4 2 L4 32 L12 24 L18 38 L23 36 L17 22 L28 22 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
    root.appendChild(arrow);
  }
  function drawCards(f, root) {
    for (const c of CARDS) {
      if (f < c.at || f >= c.until) continue;
      const card = document.createElement("div");
      card.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;background:${c.background ?? "#0f172a"};color:#fff;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;text-align:center`;
      if (c.logo) {
        const img = document.createElement("img");
        img.src = c.logo;
        img.setAttribute("data-video-logo", "");
        img.style.cssText = `height:${c.logoHeight ?? 120}px`;
        card.appendChild(img);
      }
      for (const line of String(c.title ?? "").split("\n").filter(Boolean)) {
        const h = document.createElement("div");
        h.textContent = line;
        // 見出しの印は行ごとに付ける。まとめた枠で測ると、狭い行の横まで安全域の外にかかって見える
        h.setAttribute("data-video-heading", "");
        h.style.cssText = `font-weight:800;font-size:${c.titlePx ?? 72}px;line-height:1.25`;
        card.appendChild(h);
      }
      if (c.subtitle) {
        const sub = document.createElement("div");
        sub.textContent = c.subtitle;
        sub.setAttribute("data-video-heading", "");
        sub.style.cssText = `font-weight:600;font-size:${c.subtitlePx ?? 36}px;opacity:.85`;
        card.appendChild(sub);
      }
      root.appendChild(card);
    }
  }
  function drawNotes(f, root) {
    const shown = NOTES.filter((n) => f >= n.at && (n.until === undefined || f < n.until));
    if (shown.length === 0) return;
    // 断りと注記は本編より目立たせない。同じ大きさで右下にまとめる
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;right:24px;bottom:20px;display:flex;flex-direction:column;align-items:flex-end;gap:6px";
    for (const n of shown) {
      const el = document.createElement("div");
      el.textContent = n.text;
      el.setAttribute(n.kind === "dev" ? "data-video-dev-note" : "data-video-legal-note", "");
      el.style.cssText = "padding:4px 12px;border-radius:6px;background:rgba(15,23,42,.72);color:#fff;font:500 18px 'Hiragino Sans','Noto Sans JP',sans-serif";
      box.appendChild(el);
    }
    root.appendChild(box);
  }
  let shownDeck = null;
  function drawDeck(f) {
    if (MARKS.length + LABELS.length + CURSOR.length + CARDS.length + NOTES.length === 0) return;
    const fresh = document.createElement("div");
    drawCards(f, fresh);
    drawMarks(f, fresh);
    drawLabels(f, fresh);
    drawCursor(f, fresh);
    drawNotes(f, fresh);
    // 中身が変わったときだけ入れ替える。同じ中身の入れ替えでも、ブラウザに描き直させることがある
    const html = fresh.innerHTML;
    if (html === shownDeck) return;
    deckLayer().replaceChildren(...fresh.childNodes);
    shownDeck = html;
  }

  let shownTransform = null;
  const overlayFrame = (f) => {
    window.__videoFrame = f;
    ensureStyle();
    // 値が変わったときだけ書き換える。同じ値の書き換えでも、ブラウザに描き直させることがある
    const cap = CAPTIONS.find(([a, b]) => f >= a && f < b);
    const text = cap ? cap[2] : null;
    if (CAPTIONS.length > 0 && text !== shownCaption) {
      const el = captionLayer();
      el.textContent = text ?? "";
      el.style.display = text === null ? "none" : "block";
      shownCaption = text;
    }
    const body = document.body;
    if (body === null) return;
    const cam = cameraAt(f);
    const transform = cam.s === 1 && cam.x === 0 && cam.y === 0 ? "" : `scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`;
    if (transform !== shownTransform) {
      body.style.transformOrigin = "0 0";
      body.style.transform = transform;
      shownTransform = transform;
    }
    // 重ねる部品は、カメラを掛けた後の位置で描く
    drawDeck(f);
  };
  window.__overlayFrame = overlayFrame;
  if (config.mode !== "component") window.__setFrame = overlayFrame;

  // 5. 動きをコマの時刻にそろえる。CSS の動きは、初めて見つけた時刻からの偽の時計の経過に合わせる
  const born = new WeakMap();
  const syncAnimations = (f) => {
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (a.timeline !== null && !(a.timeline instanceof DocumentTimeline)) continue;
      if (!born.has(a)) born.set(a, now);
      a.pause();
      a.currentTime = now - born.get(a);
    }
    // SVG の SMIL の動きは getAnimations に入らない
    for (const svg of document.querySelectorAll("svg")) {
      svg.pauseAnimations();
      svg.setCurrentTime(f / FPS);
    }
  };
  if (config.mode !== "component") window.__syncAnimations = syncAnimations;
})();
