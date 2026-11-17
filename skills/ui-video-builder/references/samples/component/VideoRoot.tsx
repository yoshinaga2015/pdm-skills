// 部品の作り方の見本: 動画の入口。URL の ?v=動画&f=コマ で開き、撮るループに3つの関数を渡す。
// - window.__frameReady: フォントの読み込みと、その後の描画が1回終わったら真にする。撮るループはこれを待つ
// - window.__setFrame(コマ): 次のコマへ進める。React の描画を同期で済ませる
// - window.__syncAnimations(コマ): アプリの部品の CSS と SVG の動きを、ページの時計の時刻にそろえる
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { FrameProvider } from "./frame";

declare global {
  interface Window {
    __frameReady?: boolean;
    __setFrame?: (frame: number) => void;
    __syncAnimations?: (frame: number) => void;
  }
}

const FPS = 30;

// CSS の動き(グラフの伸び、読み込みの輪)は、初めて見つけた時刻からの偽の時計の経過に合わせる
const born = new WeakMap<Animation, number>();
function syncAnimations(frame: number) {
  const now = performance.now();
  for (const a of document.getAnimations()) {
    if (a.timeline !== null && !(a.timeline instanceof DocumentTimeline)) continue;
    if (!born.has(a)) born.set(a, now);
    a.pause();
    a.currentTime = now - born.get(a)!;
  }
  pauseSvg(frame);
}

// SVG の SMIL の動きは getAnimations に入らず、Playwright の animations: "disabled" でも止まらない
function pauseSvg(frame: number) {
  for (const svg of document.querySelectorAll("svg")) {
    svg.pauseAnimations();
    svg.setCurrentTime(frame / FPS);
  }
}

export function VideoRoot({ videos }: { videos: Record<string, () => React.JSX.Element> }) {
  const params = new URLSearchParams(location.search);
  const Video = videos[params.get("v") ?? ""];
  const [frame, setFrame] = useState(() => Number(params.get("f") ?? 0));
  useEffect(() => {
    window.__setFrame = (n) => flushSync(() => setFrame(n));
    window.__syncAnimations = syncAnimations;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        // CSS の動きの始まりの時刻は、撮るループが偽の時計に替えた後の __syncAnimations で初めて記録する
        pauseSvg(frame);
        window.__frameReady = true;
      });
    });
    return () => {
      cancelled = true;
    };
    // 最初のコマだけ待つ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!Video) return <div>動画が見つかりません</div>;
  return (
    <FrameProvider frame={frame} fps={FPS}>
      <Video />
    </FrameProvider>
  );
}
