# dnsmgr-frontend

基于 React、TypeScript、Vite、Tailwind CSS v4 和 shadcn/ui（Nova / Base UI）的独立 dnsmgr 前端。它只调用同源的 `dnsmgr-helper` 稳定 API，不依赖原 PHP 模板、jQuery 或 Bootstrap Table。

当前实现：

- CAS / dnsmgr 双登录态边界与 JSON 401 恢复页
- 响应式 shadcn Sidebar 控制台布局
- 登录身份、上游版本和适配能力概览
- 域名搜索、分页、平台/到期/分类信息
- 解析记录搜索、分页、状态、线路、TTL 和复制记录值
- 根路径或子路径两种 nginx 部署方式
- 明确的只读标识；当前不会修改 DNS 数据

## 开发

要求 Node.js 22 或更高版本，并先启动 `dnsmgr-helper`：

```powershell
npm install
npm run dev
```

Vite 默认把 `/api/web/v1` 代理到 `http://127.0.0.1:3001`。可复制 `.env.example` 调整：

```dotenv
VITE_BASE_PATH=/
VITE_HELPER_DEV_URL=http://127.0.0.1:3001
```

## 构建与路径

最终挂载到站点根路径：

```powershell
npm run build
```

并行联调时挂到 `/next/`：

```powershell
$env:VITE_BASE_PATH='/next/'
npm run build
```

Vite 会同时调整资源地址，React Router 会从同一个 base path 读取路由；Web API 始终使用同源根路径 `/api/web/v1/`。nginx 的 `try_files` 必须回退到对应的 `index.html`。

## 验证

```powershell
npm run lint
npm run build
```

生产路径融合、现有 CAS 适配器保留方式和私有原版入口见 `dnsmgr-helper/docs/openresty-sso.md`。
