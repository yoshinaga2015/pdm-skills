// 部品の作り方の見本: コマの範囲を値の範囲に写す。
export type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo: Easing = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** frame が f0 から f1 の間に、値を v0 から v1 へ変える。範囲の外は端の値 */
export function interp(frame: number, [f0, f1]: [number, number], [v0, v1]: [number, number], easing?: Easing): number {
  if (frame <= f0) return v0;
  if (frame >= f1) return v1;
  const t = (frame - f0) / (f1 - f0);
  return v0 + (v1 - v0) * (easing ? easing(t) : t);
}

// 使う側: フレーム30から45の間に、不透明度を0から1へなめらかに変える
//   const { frame } = useFrame();
//   const opacity = interp(frame, [30, 45], [0, 1], easeOutCubic);
