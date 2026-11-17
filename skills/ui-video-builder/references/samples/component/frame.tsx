// 部品の作り方の見本: コマの番号を配る仕組み。1枚の画面は、コマの番号だけで決まる。
// 動画の部品では Date.now()、Math.random()、setTimeout、通信を使わない。値はコマの番号から計算する。
import { createContext, useContext, type ReactNode } from "react";

type FrameValue = { frame: number; fps: number };

const FrameContext = createContext<FrameValue | null>(null);

export function FrameProvider({ frame, fps, children }: FrameValue & { children: ReactNode }) {
  return <FrameContext.Provider value={{ frame, fps }}>{children}</FrameContext.Provider>;
}

export function useFrame(): FrameValue {
  const v = useContext(FrameContext);
  if (!v) throw new Error("useFrame must be used inside FrameProvider");
  return v;
}

/** from から durationInFrames の間だけ描き、中の部品には始めを 0 としたコマを配る */
export function Seq({ from, durationInFrames, children }: { from: number; durationInFrames: number; children: ReactNode }) {
  const { frame, fps } = useFrame();
  const local = frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  return <FrameContext.Provider value={{ frame: local, fps }}>{children}</FrameContext.Provider>;
}
