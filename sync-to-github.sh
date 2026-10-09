#!/usr/bin/env bash
# AI 论文宠物 — 本地仓库一键同步到 GitHub
# 用法：在 Git Bash 里 cd 到项目根目录，运行  bash sync-to-github.sh
# 作用：完成"链接 + 首次提交 + 推送"的安全准备。不会在没确认的情况下强制覆盖远程。
# 注意：安装包在 GitHub Releases（不在仓库内），本脚本不影响它。

set -e

echo "== 0. 当前状态 =="
git remote -v
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "（无提交，默认分支待定）")
echo "当前分支：$BRANCH"

# 1. 分支改名，对齐 GitHub 默认分支 main
if [ "$BRANCH" != "main" ]; then
  echo "== 1. 分支改名 $BRANCH -> main =="
  git checkout -b main 2>/dev/null || git branch -m "$BRANCH" main
fi

# 2. 拉取远程引用（让你先看清 GitHub 上的真实状态，再决定怎么推）
echo "== 2. 拉取远程引用 =="
if ! git fetch origin; then
  echo "fetch 失败：请检查网络、远程地址或登录凭证（GitHub 可能需要 token / SSH）。"
  exit 1
fi

# 本地缺 LICENSE 时，从 origin/main 取回（GitHub 上是 MIT License）
if [ ! -f LICENSE ] && git cat-file -e origin/main:LICENSE 2>/dev/null; then
  echo "本地缺 LICENSE，从 origin/main 取回"
  git checkout origin/main -- LICENSE
fi

# 3. 暂存（.gitignore 已忽略 *.db / *.pyc 等，不会提交个人数据）
echo "== 3. 暂存全部改动 =="
git add -A

# 4. 提交
echo "== 4. 提交 =="
if git diff --cached --quiet; then
  echo "没有需要提交的改动，跳过"
else
  git commit -m "chore: sync local project to GitHub (v2 PRD 重制 + 原型线框)"
fi

# 5. 推送（优先普通 push；历史不相关时引导安全的强制推送）
echo "== 5. 推送 =="
if git push -u origin main 2>/dev/null; then
  echo "✅ 普通推送成功，本地已与 GitHub 同步。"
else
  echo "普通推送被拒（本地与 GitHub 历史不相关，或远程有你自己的新提交）。"
  echo "请先确认：GitHub 自 2026-08-18 后有没有你自己的新提交。"
  echo "  - 若没有，且你确认要用本地覆盖远程，运行下面这行（--force-with-lease 比 --force 安全）："
  echo "      git push -u origin main --force-with-lease"
  echo "  - 若 GitHub 上有你自己的新内容，先  git pull origin main --allow-unrelated-histories  再处理冲突。"
  echo "（安装包在 GitHub Releases，不在此仓库内，不会被本操作影响）"
fi
