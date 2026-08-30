# dnsmgr-frontend

基于 React、TypeScript、Vite、Tailwind CSS v4 和 shadcn/ui（Nova / Base UI）的独立 dnsmgr 前端。它只调用同源的 `dnsmgr-helper` 稳定 API，不依赖原 PHP 模板、jQuery 或 Bootstrap Table。

当前实现：

- helper 自主管理的 CAS / dnsmgr 双登录态边界与 JSON 401 恢复页
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

## nginx 容器

仓库提供面向最终根路径部署的多阶段镜像。Node.js 构建阶段执行 lint 和 Vite build；运行层使用官方 `nginx:stable-alpine-slim`，不包含 Node.js、npm、源码、开发依赖或构建缓存，只保留 nginx 最小运行环境、配置和 `dist` 静态文件：

```powershell
docker build --build-arg APP_VERSION=0.1.1 -t dnsmgr-frontend:local .
$env:DNSMGR_FRONTEND_IMAGE = 'dnsmgr-frontend:local'
$env:DNSMGR_FRONTEND_PORT = '19103'
docker compose up -d
```

默认镜像为 `registry.hanada.info/hanada/dnsmgr-frontend:latest`，宿主机只在 `127.0.0.1:${DNSMGR_FRONTEND_PORT:-19103}` 提供服务。容器内 nginx 监听非特权端口 `8080`，以非 root 用户运行，并明确固定 `worker_processes 1`；常驻 nginx 进程只有一个 master 和一个 worker。

内层 nginx 只负责静态资源、SPA fallback、缓存和 `/healthz`，不代理 helper。外层 EdgeResty 应先把 `/api/web/v1/`、`/cas/`、`/login`、`/logout` 路由到 helper，再使用项目现有的定制 `proxy_select` 逻辑把页面请求路由到前端容器：

```nginx
location ^~ /assets/ {
    lua_config proxy_select_local http://127.0.0.1:19103;
    proxy_cache_lock_timeout 5s;
    proxy_cache_valid 200 206 365d;
    lua_config client_cache immutable;
    response_header_control clear Set-Cookie;
    include snippet/http_proxy_select_pass.conf;
}

location / {
    lua_config proxy_select_local http://127.0.0.1:19103;
    lua_config client_cache bust;
    set $no_cache 1;
    include snippet/http_proxy_select_pass.conf;
}
```

完整站点参考配置见 `dnsmgr-helper/deploy/http_dns.hanada.info.conf.example`。

GitLab CI 使用与 dnsmgr-helper 相同的 `debian-x86_64`、`debian-aarch64` Runner 和 `HARBOR_USERNAME`、`HARBOR_PASSWORD` 变量，发布 `${VERSION}` 与 `latest` 多架构 manifest。根目录 `VERSION` 必须与 `package.json` 版本一致。

## 验证

```powershell
npm run lint
npm run build
```

生产路径融合、helper 接管 CAS 和原版 dnsmgr 直连方式见 `dnsmgr-helper/docs/openresty-sso.md`。
