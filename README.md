# pdm-skills

プロダクトマネージャー（PdM）の仕事に使う、AIエージェント向けのスキル集です。実際の業務で使いながら作り、役に立ったものを収録しています。

スキルは [Agent Skills](https://agentskills.io/specification) の形式（`SKILL.md`）で書いているので、Cursor、Claude Code など、この形式を読むエージェントで使えます。

[English](#english)

## 収録しているスキル

| スキル | できること | 使う場面 |
| --- | --- | --- |
| [analysis-report](skills/analysis-report/SKILL.md) | 広告やサイトの数字を、関係者が数分で読めるHTMLのレポートやダッシュボードにまとめる | 広告の結果の分析、媒体・広告・ページごとのCVRやCPAの比較、目標に届くまでの見込み |
| [ui-creation](skills/ui-creation/SKILL.md) | コンバージョンを意識した型を使って、新しい画面の構成、文言、CTAを組み立てる | オンボーディング、料金、課金、購入、商品詳細の画面を新しく作るとき |
| [ui-improvement](skills/ui-improvement/SKILL.md) | 今の画面の課題を、仮説、比べる案、評価の計画にまとめる | 今の画面のCVRや継続率を上げたいとき、成果が出ない理由を探るとき |
| [usecase-reviewer](skills/usecase-reviewer/SKILL.md) | ユースケース記述が、PRD、仕様、実装計画の入力として使えるかを評価する | ユースケースを書いたあと、PRDに進む前 |
| [implement-figma-to-code](skills/implement-figma-to-code/SKILL.md) | Figmaのデザインを、見た目を合わせたコードにする | FigmaのURLから部品や画面を実装するとき。Figma MCPサーバーの接続が必要 |
| [git-worktree-pr-flow](skills/git-worktree-pr-flow/SKILL.md) | git worktreeでブランチごとに作業フォルダを分け、mainをきれいに保つ | PRを立てて開発するとき |

## 入れ方

### 1行で入れる

Cursorで使いたいプロジェクトのフォルダで、ターミナルに次の1行を貼って実行します。スキルは`.cursor/skills`に入ります。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash
```

入れる先は、次のオプションで変えられます。

| 入れる先 | オプション |
| --- | --- |
| 今のプロジェクトだけ（`./.cursor/skills`、既定） | `--project` |
| このPCのすべてのプロジェクト（`~/.cursor/skills`） | `--global` |
| Claude Codeで、すべてのプロジェクト | `--dest "$HOME/.claude/skills"` |
| Claude Codeで、今のプロジェクトだけ | `--dest .claude/skills` |
| 好きな場所 | `--dest <フォルダ>` |

オプションは、次のように`bash -s --`のあとに付けます。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --global
```

Cursorは`.claude/skills`も読むので、Claude Codeの場所に入れればどちらからでも使えます。

### 中身を確かめてから入れる

ネットから取ってきたスクリプトをそのまま実行するのが不安な場合は、先に中身を読んでから実行できます。インストーラーは、このリポジトリの`skills/`を入れる先にコピーするだけです。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh -o install.sh
less install.sh
bash install.sh --project
```

スクリプトを使わずに、フォルダをコピーして入れることもできます。

```bash
git clone https://github.com/yoshinaga2015/pdm-skills.git
cp -R pdm-skills/skills/analysis-report .cursor/skills/
```

### 版を固定する

`--ref`で、ブランチ、タグ、コミットを指定できます。チームで同じ版をそろえたいときに使います。

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash -s -- --ref <コミットのSHA>
```

## 使い方

入れたあとは、エージェントに普段どおり頼むだけです。エージェントは、頼まれた内容と各スキルの`description`を見て、合うスキルを自分で読み込みます。

- 「この広告の書き出しを分析して、ダッシュボードにして」→ analysis-report
- 「この料金ページのCVRを上げたい」→ ui-improvement

スキルの名前を挙げて頼むこともできます（例：「analysis-reportのスキルでまとめて」）。

## 更新と削除

更新は、入れたときと同じコマンドをもう一度実行します。同じ名前のスキルは、最新の中身で置き換わります。

削除は、入れた先からスキルのフォルダを消します。

```bash
cd .cursor/skills   # --global で入れた場合は ~/.cursor/skills
rm -rf analysis-report ui-creation ui-improvement usecase-reviewer implement-figma-to-code git-worktree-pr-flow
```

2026年11月より前に入れた場合は、名前を変える前の`usecase_reviewer`のフォルダも残っています。あわせて消してください。

## 必要なもの

macOSかLinuxで、`bash`、`curl`、`tar`、`rsync`、`mktemp`が使えること。macOSには最初から入っています。

## うまくいかないとき

| 症状 | 確かめること |
| --- | --- |
| `command not found` と出る | 上の「必要なもの」のコマンドが入っているか |
| 権限のエラーが出る | 書き込める場所を`--dest`で指定する |
| エージェントがスキルを使わない | 入れた先が、そのエージェントが読む場所か。エージェントを再起動したか |
| 何も入らない | ネットにつながっているか。`--ref`の値が正しいか |

## ライセンス

[MIT License](LICENSE)

## ご利用にあたって

- スキルは、エージェントへの指示を書いた文書です。エージェントの出力は、使う前に必ず人が確かめてください。
- 不具合や改善の提案は、[Issues](https://github.com/yoshinaga2015/pdm-skills/issues) にお寄せください。

---

## English

A collection of AI agent skills for product management work. Each skill was built while doing real work and kept because it proved useful.

Skills follow the [Agent Skills](https://agentskills.io/specification) format (`SKILL.md`), so they work with any agent that reads it, including Cursor and Claude Code.

### Skills

| Skill | What it does | When to use |
| --- | --- | --- |
| [analysis-report](skills/analysis-report/SKILL.md) | Turns ad and site metrics into an HTML report or dashboard a stakeholder can read in minutes | Analyzing ad results, comparing CVR/CPA by channel, ad, or page, projecting time to a goal |
| [ui-creation](skills/ui-creation/SKILL.md) | Drafts the structure, copy, and CTAs of a new screen with conversion-oriented patterns | Building onboarding, pricing, paywall, checkout, or product detail screens |
| [ui-improvement](skills/ui-improvement/SKILL.md) | Turns problems with an existing screen into hypotheses, variants, and an evaluation plan | Raising CVR or retention, diagnosing an underperforming screen |
| [usecase-reviewer](skills/usecase-reviewer/SKILL.md) | Reviews a use case description as input for a PRD, spec, and implementation plan | After writing a use case, before the PRD |
| [implement-figma-to-code](skills/implement-figma-to-code/SKILL.md) | Implements Figma designs as code that matches visually | Building components from Figma URLs. Requires the Figma MCP server |
| [git-worktree-pr-flow](skills/git-worktree-pr-flow/SKILL.md) | Keeps one working folder per branch with git worktree so main stays clean | PR-based development |

### Install

Run this in the project folder. Skills go to `.cursor/skills`.

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh | bash
```

| Target | Option |
| --- | --- |
| Current project only (`./.cursor/skills`, default) | `--project` |
| All projects on this machine (`~/.cursor/skills`) | `--global` |
| Claude Code, all projects | `--dest "$HOME/.claude/skills"` |
| Claude Code, current project | `--dest .claude/skills` |
| Any folder | `--dest <path>` |

Pass options after `bash -s --`, for example `... | bash -s -- --global`. Cursor also reads `.claude/skills`, so installing to the Claude Code location covers both.

**Prefer to inspect first?** Download the script, read it, then run it. It only copies this repository's `skills/` folder to the target.

```bash
curl -fsSL https://raw.githubusercontent.com/yoshinaga2015/pdm-skills/main/scripts/install.sh -o install.sh
less install.sh
bash install.sh --project
```

Or skip the script and copy a skill folder from a clone. Use `--ref <branch|tag|sha>` to pin a version across a team.

### Use

Ask the agent as usual. It reads each skill's `description` and loads the matching skill on its own. You can also name the skill in your request.

### Update and uninstall

Run the install command again to update. To uninstall, delete the skill folders from the target directory. If you installed before November 2026, also delete the old `usecase_reviewer` folder (renamed to `usecase-reviewer`).

### Requirements

macOS or Linux with `bash`, `curl`, `tar`, `rsync`, and `mktemp`.

### License

[MIT License](LICENSE)

### Notes

Skills are instructions for an agent. Always review the agent's output before relying on it. Bug reports and suggestions are welcome in [Issues](https://github.com/yoshinaga2015/pdm-skills/issues).
