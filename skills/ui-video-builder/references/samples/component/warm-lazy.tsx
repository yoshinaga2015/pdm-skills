// 部品の作り方の見本: 遅延読み込みの部品を、本番の描画の前に読み込んでおく。
// React.lazy の部品は、読み込みが済むまで代わりの表示を出す。撮るループはページを開き直すので、
// そのままでは代わりの表示のまま撮ることがある。見えない場所で一度描き、本物に替わったのを確かめる。
// 例は Markdown の部品。代わりの表示は ** をそのまま出し、Markdown は太字にして ** を消すので、その違いで見分ける。
import { createRoot } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";

export async function warmLazy(Component: ComponentType<{ children: ReactNode }>) {
  const host = document.createElement("div");
  host.hidden = true;
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<Component>{"**x**"}</Component>);
  const rendered = () => host.textContent?.trim() === "x";
  for (let i = 0; i < 600 && !rendered(); i++) await new Promise((r) => requestAnimationFrame(r));
  const ok = rendered();
  root.unmount();
  host.remove();
  if (!ok) throw new Error("遅延読み込みの部品を読み込めませんでした");
}

// 動画の入口(main.tsx)で、本番の描画の前に呼ぶ
//   await warmLazy(ChatMarkdown);
//   createRoot(document.getElementById("root")!).render(<VideoRoot videos={VIDEOS} />);
