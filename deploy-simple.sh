#!/usr/bin/env sh

# 简化版部署脚本
set -e

echo "🚀 开始部署..."

# 构建主包
echo "📦 构建主包..."
pnpm build

# 构建 playground
echo "🎮 构建 playground..."
cd playground
pnpm build

# 部署到 GitHub Pages
echo "🌐 部署到 GitHub Pages..."
cd dist
git init
git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
git push -f https://github.com/Sunny-117/browser-storage-lru-cleaner.git main:gh-pages

echo "✅ 部署完成！"
echo "🔗 访问地址: https://sunny-117.github.io/browser-storage-lru-cleaner/"