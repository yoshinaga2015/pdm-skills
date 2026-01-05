---
name: git-worktree-pr-flow
description: PRベースで開発する際に、git worktreeを使ってブランチごとに作業ディレクトリを分離し、mainを常にクリーンに保つ運用を実行する。
---

# Git Worktree + PR Flow

## いつ使うか
- ユーザーが「PRベースで進める」または「git worktreeを使いたい」と言ったとき
- 複数作業を並行したいとき（例: CLI生成/DB/API/UI）

## 前提
- `main` は常に動く状態（テストが通る）
- 1ブランチ = 1PR = 1worktree
- PRは小さく（目的を1つに絞る）

## 命名
- ブランチ: `feat/<short>` / `fix/<short>` / `docs/<short>`
- worktreeフォルダ: `../<repo>-wt/<branch-alias>`（例: `../AINewsWebforAsian-wt/feat-cli-generate-news`）

## 手順（新しいPRを始める）
1) `main` を最新化する
- `git switch main`
- `git pull --ff-only`

2) worktreeを追加する（ブランチ新規作成を伴う）
- `git worktree add -b feat/<short> ../<repo>-wt/feat-<short> main`

3) 作業ディレクトリへ移動して開発する
- `cd ../<repo>-wt/feat-<short>`

4) テスト → commit → push → PR作成
- 先にテスト（Red→Green→Refactor）を置く
- PRは「差分が説明できる最小単位」で切る

5) PRが `main` にマージされたら後片付け
- `git worktree remove ../<repo>-wt/feat-<short>`
- `git branch -d feat/<short>`

## 重要な注意（ハマり防止）
- worktree削除前にブランチ削除しない
- 依存関係（`node_modules`等）はworktreeごとになりがち（ディスク増）
- `.env` は共有しない（各worktreeに用意するか、参照方法を統一する）
- PR作成前に `main` の更新が入っていたら、必要ならrebase/mergeで取り込んでから提出する