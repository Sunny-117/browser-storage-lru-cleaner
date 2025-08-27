#!/usr/bin/env sh

# 本地预览脚本
set -e

echo "🔍 本地预览 playground..."

# 构建主包
echo "📦 构建主包..."
pnpm build

# 构建并预览 playground
echo "🎮 构建 playground..."
cd playground
pnpm build

echo "🌐 启动预览服务器..."
pnpm preview