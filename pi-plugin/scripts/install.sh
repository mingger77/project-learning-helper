#!/usr/bin/env bash
# 把本插件安装到目标项目：./install.sh [目标目录] [--force]
set -euo pipefail

target="${1:-.}"
force="${2:-}"
src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.pi"
dst="$target/.pi"

if [ -e "$dst" ] && [ "$force" != "--force" ]; then
  echo "$dst 已存在；如需覆盖请加 --force（或手动合并）" >&2
  exit 1
fi

rm -rf "$dst"
mkdir -p "$dst"
cp -r "$src/." "$dst/"

echo "已安装项目学习插件到 $dst"
echo "下一步：cd $target && pi --approve；然后执行 /ask"
