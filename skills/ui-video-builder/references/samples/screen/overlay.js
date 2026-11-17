// 画面の作り方の見本: ページに重ねる層。Playwright の addInitScript で、アプリのページに差し込む。
// アプリのコードは変えない。差し込む前に window.__videoConfig に動画の設定を入れておく(shoot.mjs)。
//
// することは5つ。
// 1. Math.random を、呼んだ場所ごとに決まった値を返すものに替える。アプリが乱数で選ぶ文や絵を、毎回同じにする
// 2. 撮るときに映したくないものを隠す。入力欄のカーソル、フレームワークの開発用の表示、config.hide の要素
// 3. 字幕を描く。動画の px で置くので、ページの拡大(カメラ)の影響を受けないよう html の直下に置く
// 4. カメラを描く。body を transform で拡大・移動する。寄る先は画面の全体か、要素の選択子で決める
// 5. CSS と SVG の動きを、コマの時刻にそろえる
//
// window.__setFrame(コマ) と window.__syncAnimations(コマ) を、撮るループが毎コマ呼ぶ。
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

  let shownTransform = null;
  window.__setFrame = (f) => {
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
  };

  // 5. 動きをコマの時刻にそろえる。CSS の動きは、初めて見つけた時刻からの偽の時計の経過に合わせる
  const born = new WeakMap();
  window.__syncAnimations = (f) => {
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
})();
