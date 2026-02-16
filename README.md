# pdm-skills

*English below*

作成したCursor Agent Skills をPdM向けにまとめた公開スキル集です。

**この導入方法では、このリポジトリを事前に Clone する必要はありません。**  
下のコマンドを実行すれば、自動でGitHubから直接インストーラーを取得して実行します。

## クイックインストール

このREADMEは、**非エンジニアのPdMでも迷わず使える**ように書いています。  
まずは次の手順だけでOKです。

### 手順1: Cursorで使いたいプロジェクトを開く

インストール先は、今開いているプロジェクトの `.cursor/skills` です。

### 手順2: Terminalを開く

- Mac: `Terminal` アプリを開く  
- Cursor内のTerminalでもOKです

### 手順3: 下の1ブロックを「丸ごと」コピーして実行

**注意:** このコードブロックは1行です。  
1行すべてをコピーして、Terminalに貼り付けて Enter を押してください。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash
```

これでインストール完了です。

## どこに入れるかを選びたい場合

### A. 今のプロジェクトだけで使う（おすすめ）

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --project
```

### B. PC内のすべてのプロジェクトで使う

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --global
```

### C. 保存先を自分で指定する

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --dest "$HOME/.cursor/skills"
```

## 更新方法

インストールと同じコマンドを、もう一度実行するだけです。  
最新版に同期されます。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash
```

## 用語ミニ解説（非エンジニア向け）

- `Terminal`: 文字で操作する画面
- `.cursor/skills`: Cursorがスキルを読む保存場所
- `--global`: PC全体で使うモード
- `--project`: 今のプロジェクトだけで使うモード
- `--dest`: 保存先を自分で指定するオプション
- `--ref`: 使うバージョン（ブランチやタグ）を指定するオプション

## 特定バージョンを使いたい場合（任意）

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --ref main
```

## アンインストール

インストール先のスキルディレクトリを削除してください。

```bash
# プロジェクトローカルの削除（現行スキルセット）
rm -rf \
  .cursor/skills/git-worktree-pr-flow \
  .cursor/skills/implement-figma-to-code \
  .cursor/skills/ui-creation \
  .cursor/skills/ui-improvement \
  .cursor/skills/usecase_reviewer

# グローバルの削除（現行スキルセット）
rm -rf \
  "$HOME/.cursor/skills/git-worktree-pr-flow" \
  "$HOME/.cursor/skills/implement-figma-to-code" \
  "$HOME/.cursor/skills/ui-creation" \
  "$HOME/.cursor/skills/ui-improvement" \
  "$HOME/.cursor/skills/usecase_reviewer"
```

## 必要コマンド

- `bash`
- `curl`
- `tar`
- `rsync`
- `mktemp`

## トラブルシュート

- `command not found`: 必要コマンドが不足しています。上記をインストールしてください。
- 権限エラー: 書き込み可能なインストール先を指定してください（必要なら `--dest` を使用）。
- 何も入らない: ネットワーク接続と `--ref` の指定値を確認してください。

---

A public collection of Cursor Agent Skills for product development work.

You do **not** need to clone this repository before installing.  
The commands below download and run the installer directly from GitHub.

## Quick Install

Install to the current project's `.cursor/skills` directory (default):

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash
```

## Install Targets

Use one of the following options:

```bash
# Explicit project install (same as default)
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --project

# Global install for all projects
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --global

# Custom destination
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --dest "$HOME/.cursor/skills"
```

## Install a Specific Ref

Install from a specific branch, tag, or commit:

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --ref main
```

## Update

Run the same install command again. The installer re-syncs all included skills.

## Uninstall

Remove installed skill directories from your target path:

```bash
# Project-local uninstall (current skill set)
rm -rf \
  .cursor/skills/git-worktree-pr-flow \
  .cursor/skills/implement-figma-to-code \
  .cursor/skills/ui-creation \
  .cursor/skills/ui-improvement \
  .cursor/skills/usecase_reviewer

# Global uninstall (current skill set)
rm -rf \
  "$HOME/.cursor/skills/git-worktree-pr-flow" \
  "$HOME/.cursor/skills/implement-figma-to-code" \
  "$HOME/.cursor/skills/ui-creation" \
  "$HOME/.cursor/skills/ui-improvement" \
  "$HOME/.cursor/skills/usecase_reviewer"
```

## Requirements

- `bash`
- `curl`
- `tar`
- `rsync`
- `mktemp`

## Troubleshooting

- `command not found`: Install the missing dependency listed above.
- Permission errors: Use a writable target directory (`--dest` if needed).
- Nothing installed: Check your network and verify the selected `--ref` exists.