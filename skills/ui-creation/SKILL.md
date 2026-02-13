---
name: ui-creation
description: Designs new UI flows and screens using conversion-oriented patterns from Flow knowhow. Use when creating new onboarding, pricing, paywall, checkout, or product detail UI, or when the user asks to draft UI structure, copy, CTA, and information hierarchy from scratch.
---

# UI Creation Skill

## 目的
新規UIを作るときに、`Flow` のABテスト知見を初期設計へ反映し、最初から「分かりやすい + 収益性 + 信頼」を両立させる。

## いつ使うか
- 新機能の画面をゼロから作るとき
- LP / pricing / paywall / checkout / onboarding の新規作成時
- CTA文言、アイコン、価格表現、フォーム構成の初期案が必要なとき

## 実行手順
1. **画面の役割を定義**
   - この画面で達成したい行動を1つに絞る（例: trial開始、購入完了、オンボード完了）。
2. **必須情報とノイズを分離**
   - `must-have`（意思決定に必要）と `nice-to-have`（補足）を分ける。
   - `見やすい` と `納得できる` を別々に設計する。
3. **導線摩擦を先に下げる**
   - 初期ステップは最小入力にし、重い入力は後段へ移す。
   - 可能なら `smart default + 後で編集` を使う。
4. **不安解消を組み込む**
   - 価格条件、課金タイミング、解約導線、返品条件を明示する。
   - 信頼要素（レビュー、保証、根拠）を主要CTA周辺に配置する。
5. **訴求を2系統で用意**
   - 機能訴求 vs 便益訴求
   - 理性訴求 vs 感情訴求
   - action-focused CTA vs value-focused CTA
6. **A/B前提の出力にする**
   - 必ず比較案を2-3案出す（A: 現状寄り / B: 強い改善 / C: 折衷）。

## 画面別デフォルト指針

### Onboarding
- 強制選択や強制入力は最小化し、価値体験を先に置く。
- 多意図入力を使う場合は、選択肢過多を避けて直後体験へ反映する。
- チェックリスト型は、長期定着に効く行動だけを採用する。

### Pricing / Plan Selection
- 価格比較軸（機能差、上限、サポート条件）を残す。
- デフォルトプラン強調時も、代替プラン導線を隠さない。
- 分解価格（月額）を出すなら、総額と契約条件を必ず併記する。

### Paywall
- hard gate と soft gate を比較前提で設計する。
- コピーは gain framing を候補に入れる。
- ビジュアルは装飾目的ではなく、価値文脈と結び付ける。

### Checkout
- 購入前の不要なアカウント作成や重入力を減らす。
- 支払い手段の可視性と切替導線の発見性を高める。
- 透明性コピー（返品・解約・請求条件）を先に見せる。

### PDP / LP
- feature-first と benefit-first を比較して作る。
- 専用LPは流入意図とメッセージを一致させ、分岐を減らす。
- 既存便益の認知不足を、まず表示改善で解決する。

## 出力フォーマット
UI作成の提案は必ず以下で返す。

```markdown
## 目的
- [この画面で達成する行動]

## 対象ユーザーと文脈
- [誰が / どの状態で来るか]

## UI案
- A案: [構成と意図]
- B案: [構成と意図]
- C案(任意): [折衷案]

## コピー/要素案
- 見出し:
- 補助文:
- CTA:
- 信頼要素:

## 期待効果と評価
- 主指標: [CVR / 完了率 など]
- 副指標: [離脱 / 問い合わせ / 継続 / 返金 など]
- ガードレール: [透明性低下、品質悪化を防ぐ条件]
```

## ガードレール
- 収益改善だけで採用しない。継続品質（解約/返金/NPS）を併記する。
- ダークパターン（誤認させる強調、隠し条件）は禁止。
- 「シンプル化」は手段であり、意思決定情報の削除を正当化しない。
