# 部署指南

本文档介绍如何部署 Browser Storage LRU Cleaner 的 Playground 演示页面。

## 🚀 快速部署

### 方法一：使用 npm 脚本（推荐）

```bash
# 开发模式运行 playground
pnpm playground:dev

# 构建 playground
pnpm playground:build

# 本地预览构建结果
pnpm playground:preview

# 部署到 GitHub Pages（完整版）
pnpm deploy

# 部署到 GitHub Pages（简化版）
pnpm deploy:simple
```

### 方法二：直接运行脚本

```bash
# 完整部署脚本（包含错误处理、颜色输出等）
./deploy.sh

# 简化部署脚本
./deploy-simple.sh

# 本地预览
./preview.sh
```

## 📋 部署脚本说明

### deploy.sh（完整版）

功能特性：
- ✅ 颜色输出和详细日志
- ✅ 错误处理和回滚
- ✅ 检查未提交更改
- ✅ 自动创建 .nojekyll 文件
- ✅ 创建 404.html 用于 SPA 路由
- ✅ 完整的构建流程验证

### deploy-simple.sh（简化版）

功能特性：
- ✅ 快速部署
- ✅ 基本错误处理
- ✅ 简洁输出

### preview.sh（本地预览）

功能特性：
- ✅ 本地构建和预览
- ✅ 无需部署即可测试

## 🔧 配置说明

### GitHub Pages 配置

确保在 `playground/vite.config.ts` 中设置了正确的 base 路径：

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/browser-storage-lru-cleaner/' // 替换为你的仓库名
})
```

### 自定义域名

如果需要使用自定义域名，在 `deploy.sh` 中取消注释并修改：

```bash
# 取消注释并修改为你的域名
echo 'your-domain.com' > CNAME
```

## 📁 部署流程

1. **构建主包**
   ```bash
   pnpm build
   ```

2. **构建 Playground**
   ```bash
   cd playground
   pnpm build
   ```

3. **部署到 GitHub Pages**
   - 初始化 git 仓库
   - 添加构建文件
   - 推送到 `gh-pages` 分支

## 🌐 访问地址

部署完成后，可以通过以下地址访问：

- **GitHub Pages**: https://sunny-117.github.io/browser-storage-lru-cleaner/
- **自定义域名**: https://your-domain.com（如果配置了）

## ⚠️ 注意事项

1. **权限要求**
   - 确保有推送到仓库的权限
   - 确保 GitHub Pages 已启用

2. **分支设置**
   - GitHub Pages 需要设置为从 `gh-pages` 分支部署
   - 在仓库设置中配置 Pages 源为 `gh-pages` 分支

3. **构建依赖**
   - 确保已安装所有依赖：`pnpm install`
   - 确保主包能正常构建：`pnpm build`

4. **网络要求**
   - 部署过程需要网络连接
   - 推送到 GitHub 需要认证

## 🐛 故障排除

### 常见问题

1. **权限被拒绝**
   ```bash
   chmod +x deploy.sh deploy-simple.sh preview.sh
   ```

2. **构建失败**
   ```bash
   # 清理并重新安装依赖
   rm -rf node_modules playground/node_modules
   pnpm install
   cd playground && pnpm install
   ```

3. **推送失败**
   - 检查 GitHub 认证
   - 确保仓库 URL 正确
   - 检查网络连接

4. **页面无法访问**
   - 等待几分钟让 GitHub Pages 生效
   - 检查 GitHub Pages 设置
   - 确认 base 路径配置正确

### 调试模式

如果遇到问题，可以手动执行各个步骤：

```bash
# 1. 构建主包
pnpm build

# 2. 进入 playground
cd playground

# 3. 构建 playground
pnpm build

# 4. 检查构建结果
ls -la dist/

# 5. 本地预览
pnpm preview
```