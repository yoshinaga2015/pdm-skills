// 部品の作り方の見本: 1コマずつ撮るループ。動画の入口(VideoRoot)を開き、偽の時計で1コマずつ進めて撮る。
const FPS = 30;

/**
 * 撮らないコマでも、ブラウザに1回描かせる。ブラウザは前のコマで描いた絵の一部(変わっていない所のタイルや、
 * 拡大・縮小する部品の前の拡大率の絵)を使い回す。描かせないと、コマの間に実際に何回描いたかで縁のぼかしが変わる
 */
async function drawFrame(page) {
  await page.screenshot({ animations: "allow", caret: "hide", clip: { x: 0, y: 0, width: 1, height: 1 } });
}

/**
 * from のコマでページを開き、to の手前まで1コマずつ進める。アプリの部品の動きを映すため、コマごとにページを開き直さない。
 * 偽の時計は context に残るので、1回の撮影ごとに新しい context のページを渡す。
 */
export async function shootRun(page, url, { from, to, shoot, onShot, onFrame, clip }) {
  await page.goto(`${url}&f=${from}`);
  await page.waitForFunction(() => window.__frameReady === true);
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  for (let frame = from; frame < to; frame++) {
    if (frame > from) {
      await page.evaluate((f) => window.__setFrame(f), frame);
      await page.clock.runFor(1000 / FPS);
    }
    await page.evaluate((f) => window.__syncAnimations(f), frame);
    if (onFrame !== undefined) await onFrame(frame, page);
    if (!shoot(frame)) {
      await drawFrame(page);
      continue;
    }
    const png = await page.screenshot({ animations: "allow", caret: "hide", ...(clip === undefined ? {} : { clip }) });
    await onShot(frame, png, page);
  }
}
