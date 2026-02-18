#!/usr/bin/env sh

# Browser Storage LRU Cleaner - Playground 部署脚本
# 用于构建和部署 playground 到 GitHub Pages

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 错误时退出
set -e

# 错误处理函数
handle_error() {
    print_error "部署过程中发生错误，退出码: $1"
    exit $1
}

# 捕获错误
trap 'handle_error $?' ERR

print_info "开始部署 Browser Storage LRU Cleaner Playground..."

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    print_error "请在项目根目录运行此脚本"
    exit 1
fi

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    print_warning "检测到未提交的更改，建议先提交代码"
    read -p "是否继续部署? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "部署已取消"
        exit 0
    fi
fi

# 1. 构建主包
print_info "构建主包..."
pnpm build

# 2. 进入 playground 目录
print_info "进入 playground 目录..."
cd playground

# 3. 安装 playground 依赖（如果需要）
if [ ! -d "node_modules" ]; then
    print_info "安装 playground 依赖..."
    pnpm install
fi

# 4. 构建 playground
print_info "构建 playground..."
pnpm build

# 5. 进入构建输出目录
print_info "准备部署文件..."
cd dist

# 6. 创建 .nojekyll 文件（GitHub Pages 需要）
touch .nojekyll

# 7. 创建 CNAME 文件（如果有自定义域名）
# echo 'your-domain.com' > CNAME

# 8. 创建 404.html 用于 SPA 路由
cat > 404.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Browser Storage LRU Cleaner</title>
    <script>
        // GitHub Pages SPA 重定向
        var pathSegmentsToKeep = 1;
        var l = window.location;
        l.replace(
            l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
            l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
            l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
            (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
            l.hash
        );
    </script>
</head>
<body>
    <div>Redirecting...</div>
</body>
</html>
EOF

# 9. 初始化 git 仓库
print_info "初始化部署仓库..."
git init -b main
git add -A

# 10. 提交更改
print_info "提交构建文件..."
git commit -m "deploy: playground $(date '+%Y-%m-%d %H:%M:%S')"

# 11. 推送到 GitHub Pages
print_info "推送到 GitHub Pages..."
git push -f https://github.com/Sunny-117/browser-storage-lru-cleaner.git main:gh-pages

# 12. 清理
print_info "清理临时文件..."
cd ../..
rm -rf playground/dist/.git

print_success "部署完成！"
print_info "Playground 地址: https://sunny-117.github.io/browser-storage-lru-cleaner/"
print_info "可能需要几分钟时间生效"