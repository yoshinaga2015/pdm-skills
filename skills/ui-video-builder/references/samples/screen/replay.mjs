// 画面の作り方の見本: 録った通信を返す仕組み。撮るときに、アプリの通信をバックエンドへ届かせず、録った応答で返す。
//
// 返す通信は3種類。
// - HTTP の応答: context.route で返す
// - 少しずつ流す HTTP の応答(Server-Sent Events など): ページの fetch を差し替え、決めたコマで1つずつ渡す。
//   Playwright の route は応答を一度に返すことしかできないため
// - WebSocket: context.routeWebSocket で、バックエンドにつながずに返す。id で要求と応答が対応する形と、
//   id が無く、送った後に届いたものを応答とみなす形を扱う。ほかのプロトコルは、アプリに合わせて直す
//
// 録った応答の選び方:
// - 送る操作(scene の actions の send: true)の前と後で、時期を分ける。同じ要求でも、時期で応答が違うため
// - 時期ごとに、要求の method・path・本文(UUID を伏せた形)で引き、同じ要求が来た順に録った応答を返す
// - 要求の UUID と録った UUID の組を表に積み、返す応答の中の録った UUID を、今のページの UUID に書き換える

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const canon = (s) => String(s ?? "").replace(UUID, "<U>");
const keyOf = (method, path, body) => `${method} ${path} ${canon(body)}`;

/** ページの fetch を差し替え、流して出す応答を、Node の側から少しずつ渡せるようにする */
const STREAM_SHIM = (paths) => {
  const original = window.fetch.bind(window);
  window.__replayStreams = {};
  window.__replayPush = (id, chunk) => {
    const c = window.__replayStreams[id];
    if (!c) return;
    if (chunk === null) c.close();
    else c.enqueue(new TextEncoder().encode(chunk));
  };
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!paths.includes(url.pathname)) return original(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    const { id, contentType } = JSON.parse(await window.__replayOpen(JSON.stringify({ method, path: url.pathname + url.search, body })));
    const stream = new ReadableStream({ start: (c) => (window.__replayStreams[id] = c) });
    return new Response(stream, { status: 200, headers: { "content-type": contentType } });
  };
};

export async function installReplay(context, recording, { apiPrefix = "/api/", wsPattern = null, responseDelayFrames = 0 } = {}) {
  const state = { frame: 0, waiting: [], phase: "pre", activity: 0, misses: [], rep2rec: new Map(), rec2rep: new Map(), streams: [], sockets: [] };
  const sendAt = recording.sendAt ?? Infinity;
  const phaseOf = (t) => (t < sendAt ? "pre" : "post");

  // 録った要求を、時期と鍵ごとに順に並べる
  const pools = { pre: new Map(), post: new Map() };
  const used = { pre: new Map(), post: new Map() };
  const put = (phase, key, entry) => {
    if (!pools[phase].has(key)) pools[phase].set(key, []);
    pools[phase].get(key).push(entry);
  };
  for (const h of recording.http) put(phaseOf(h.t), keyOf(h.method, h.path, h.requestBody), h);
  const streamPaths = [...new Set(recording.http.filter((h) => h.stream).map((h) => h.path.split("?")[0]))];

  const learn = (repText, recText) => {
    const a = String(repText ?? "").match(UUID) ?? [];
    const r = String(recText ?? "").match(UUID) ?? [];
    a.forEach((u, i) => {
      if (r[i] && !state.rep2rec.has(u) && !state.rec2rep.has(r[i])) {
        state.rep2rec.set(u, r[i]);
        state.rec2rep.set(r[i], u);
      }
    });
  };
  const toPage = (text) => String(text).replace(UUID, (u) => state.rec2rep.get(u) ?? u);
  const take = (method, path, body) => {
    const key = keyOf(method, path, body);
    for (const phase of state.phase === "post" ? ["post", "pre"] : ["pre"]) {
      const list = pools[phase].get(key);
      if (!list) continue;
      const n = used[phase].get(key) ?? 0;
      used[phase].set(key, n + 1);
      const rec = list[Math.min(n, list.length - 1)];
      learn(body, rec.requestBody);
      return rec;
    }
    state.misses.push(`${state.phase} ${key.slice(0, 160)}`);
    return null;
  };

  // HTTP
  await context.route(`**${apiPrefix}**`, async (route) => {
    state.activity++;
    const req = route.request();
    const u = new URL(req.url());
    const rec = take(req.method(), u.pathname + u.search, req.postData() ?? "");
    if (!rec) return route.fulfill({ status: 404, body: "" });
    // 送った後の応答は、決めたコマ数だけ遅らせて返す。録った応答はすぐ返るので、遅らせないと「更新中」のような途中の表示が映らない
    if (state.phase === "post" && responseDelayFrames > 0) {
      await new Promise((resolve) => state.waiting.push({ due: state.frame + responseDelayFrames, resolve }));
      state.activity++;
    }
    const bytes = Buffer.from(rec.base64, "base64");
    const isText = /json|text|javascript/.test(rec.contentType);
    await route.fulfill({ status: rec.status, contentType: rec.contentType, body: isText ? Buffer.from(toPage(bytes.toString("utf8"))) : bytes });
  });

  // 流して出す HTTP
  if (streamPaths.length > 0) {
    await context.addInitScript(STREAM_SHIM, streamPaths);
    await context.exposeBinding("__replayOpen", (source, payload) => {
      state.activity++;
      const { method, path, body } = JSON.parse(payload);
      const rec = take(method, path, body);
      const id = String(state.streams.length);
      const events = rec ? Buffer.from(rec.base64, "base64").toString("utf8").split(/(?<=\n\n)/).filter(Boolean).map(toPage) : [];
      state.streams.push({ id, page: source.page, events, sent: 0 });
      return JSON.stringify({ id, contentType: rec?.contentType ?? "text/event-stream" });
    });
  }

  // WebSocket。録ったやり取りの形で、返し方を2つから選ぶ
  // - id の形: 要求と応答が同じ id を持つ JSON(RPC)。要求の形(id を除き UUID を伏せた形)で、録った応答を引く
  // - 順の形: id が無い。録った送信のそれぞれについて、次の送信までに届いた受信を、その応答とみなす
  if (wsPattern && recording.sockets?.length) {
    const parse = (p) => {
      try {
        return JSON.parse(p);
      } catch {
        return null;
      }
    };
    const outs = recording.sockets.flatMap((s) => s.frames.filter((f) => f.dir === "out"));
    const idMode = outs.length > 0 && outs.every((f) => parse(f.payload)?.id !== undefined);
    const first = recording.sockets[0];
    const firstOut = first.frames.find((f) => f.dir === "out")?.t ?? Infinity;
    const hello = first.frames.filter((f) => f.dir === "in" && f.t < firstOut).map((f) => f.payload);
    const wsKey = (m) => canon(JSON.stringify(m && typeof m === "object" ? { ...m, id: undefined } : m));
    // 録った送信と、その応答の並び
    const exchanges = [];
    if (idMode) {
      const replies = new Map();
      for (const s of recording.sockets)
        for (const f of s.frames) {
          const m = parse(f.payload);
          if (f.dir === "in" && m?.id !== undefined) {
            if (!replies.has(m.id)) replies.set(m.id, []);
            replies.get(m.id).push(f.payload);
          }
        }
      for (const f of outs) {
        const m = parse(f.payload);
        exchanges.push({ t: f.t, key: wsKey(m), payload: f.payload, id: m.id, replies: replies.get(m.id) ?? [] });
      }
    } else {
      for (const s of recording.sockets) {
        let cur = null;
        for (const f of s.frames) {
          if (f.dir === "out") {
            cur = { t: f.t, key: wsKey(parse(f.payload) ?? f.payload), payload: f.payload, replies: [] };
            exchanges.push(cur);
          } else if (cur) cur.replies.push(f.payload);
        }
      }
    }
    exchanges.sort((a, b) => a.t - b.t);
    const wsUsed = new Set();
    await context.routeWebSocket(wsPattern, (ws) => {
      state.sockets.push(ws);
      for (const p of hello) ws.send(p);
      ws.onMessage((raw) => {
        state.activity++;
        const m = parse(String(raw));
        const key = wsKey(m ?? String(raw));
        // まだ使っていない、同じ形の録った送信のうち、今の時期のものを先に選ぶ
        const candidates = exchanges.filter((e) => !wsUsed.has(e) && e.key === key);
        const rec = candidates.find((e) => phaseOf(e.t) === state.phase) ?? candidates[0];
        if (!rec) {
          state.misses.push(`${state.phase} ws ${key.slice(0, 160)}`);
          return;
        }
        wsUsed.add(rec);
        learn(String(raw), rec.payload);
        const out = rec.replies.map((p) => toPage(idMode ? p.split(rec.id).join(m.id) : p));
        // 応答が2つ以上ある送信は、流して出す応答とみなし、決めたコマで1つずつ返す
        if (out.length > 1) state.streams.push({ id: `ws${state.streams.length}`, ws, events: out, sent: 0 });
        else for (const p of out) ws.send(p);
      });
    });
  }

  return {
    state,
    /** 毎コマ呼ぶ。遅らせている応答のうち、返すコマが来たものを返す */
    tick(frame) {
      state.frame = frame;
      for (const w of state.waiting.filter((w) => w.due <= frame)) w.resolve();
      state.waiting = state.waiting.filter((w) => w.due > frame);
    },
    /** 送る操作の直前に呼ぶ。以後は、送った後の時期の応答を返す */
    beginPost() {
      state.phase = "post";
    },
    /** 流している応答を、それぞれ perFrame 個ずつ進める。全部渡し終えたら閉じる */
    async releaseStreams(perFrame = 1) {
      for (const s of state.streams) {
        if (s.done) continue;
        for (let i = 0; i < perFrame && s.sent < s.events.length; i++, s.sent++) {
          state.activity++;
          if (s.ws) s.ws.send(s.events[s.sent]);
          else await s.page.evaluate(([id, chunk]) => window.__replayPush(id, chunk), [s.id, s.events[s.sent]]);
        }
        if (s.sent >= s.events.length) {
          s.done = true;
          if (!s.ws) await s.page.evaluate((id) => window.__replayPush(id, null), s.id);
        }
      }
    },
    streaming: () => state.streams.some((s) => !s.done)
  };
}
