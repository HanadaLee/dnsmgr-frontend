# dnsmgr-frontend

基于 React、TypeScript、Vite、Tailwind CSS v4 和 shadcn/ui（Nova / Base UI）的独立 dnsmgr 前端。它只调用同源稳定 API，不依赖原 PHP 模板、jQuery 或 Bootstrap Table。

> 兼容性要求：生产环境应通过 dnsmgr-helper 接入 [HanadaLee/dnsmgr](https://github.com/HanadaLee/dnsmgr) 的 `ext` 分支。frontend、helper 与该分支的 AxisNow、证书及兼容接口同步维护；直接搭配原版 `main` 可能因能力或字段缺失产生不可预期的问题。

当前实现：

- 透明登录状态恢复：会话过期直接进入 `/login`，界面不展示认证协议或兼容层信息
- 响应式 shadcn Sidebar、亮色/暗色主题和按权限生成的导航
- 仪表盘统计、运行状态、服务器信息、版本检查与缓存清理
- 域名账户、域名、分类、到期提醒及单项/批量完整读写
- 解析记录 CRUD、检测、分组、日志、权重、别名和 QingCloud 层级记录
- 任务式批量操作：添加域名、添加/修改/删除记录、批量查询、记录导入/导出和域名导出/移除
- DNS 监控、定时切换和优选 IP 的设置、任务、状态、日志与批量操作
- 证书账户、订单、制品、证书部署、批量更换证书、DCV 托管校验和续签设置
- CloudFlare 自定义主机名、验证记录、Fallback、DCV、优选解析和 Tunnel 全部路由能力
- AxisNow DNS 路由、线路规则、潮汐/故障备份自动调度、共享 EIP 和标签管理
- 用户、域名权限、API Key、操作日志、个人安全及全部系统设置/连通性测试
- 根路径或子路径部署，以及面向生产的单 worker 最小 nginx 静态容器

功能对应关系见 `dnsmgr-helper/docs/migration-matrix.md`。UI 以 shadcn/ui 官方控件为交互基线，布局风格参考 shadcn-admin、Shadcn UI Kit Dashboard Blocks 和 CPA-Helper；亮色模式使用蓝色、白色和中性灰，不使用大面积墨蓝背景。

## 批量操作

入口为 `/batch-operations`。先选择指定域名、域名分组或全部托管域名，再填写记录或按主机记录、类型、线路、值及状态查询。记录值支持精确或包含匹配，也可不填。

- 添加记录的每一行独立填写，应用到选中的每个域名；导入文件则由每一行指定目标域名。相同域名存在于多个 DNS 账户时，使用域名 ID 明确区分。
- 修改记录时先勾选，再直接逐条编辑，允许每条记录使用不同的值。可选的公共字段填入默认“不修改”，并支持记录值原文查找替换；不会覆盖未改动的字段。
- 写入前生成逐项预览，检查服务商记录类型、线路、TTL、优先级等限制；不支持的指定线路不会被静默替换。单次最多执行 5000 项。
- DNSPod、阿里云等要求单独修改备注的服务商，备注变更会单列步骤，前置记录修改失败时不执行备注。此类服务商新增记录时应先将备注留空，创建后再通过“修改记录”保存备注。
- 每项独立显示成功、失败、未执行或结果待核对。停止操作只阻止后续请求，不中断已经发出的写入；网络中断或服务器错误不会自动重试，以免重复写入。
- 导入支持 XLSX、XLS、UTF-8 编码的 CSV / TSV，表头以页面下载模板为准。导出使用字符串单元格，避免 TXT 内容被解释为公式。导出的记录可直接重新导入。
- 页面保存本次会话最近 20 批执行明细；刷新或离开后清空，可另查服务器操作日志。当前为页面内顺序执行，不提供后台队列或断点恢复。

旧的 `/record-tools` 链接仍可打开对应的新任务；原智能解析、跨域统一值修改和全域搜索界面不再保留。DNSPod 专属的域名取回、域名共享等功能不适用于跨服务商接口，因此不提供空入口。

## 开发

要求 Node.js 22 或更高版本，并先启动同源 API 服务：

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

仓库提供面向最终根路径部署的多阶段镜像。Node.js 构建阶段执行 lint、单元测试和 Vite build；运行层使用官方 `nginx:stable-alpine-slim`，不包含 Node.js、npm、源码、开发依赖或构建缓存，只保留 nginx 最小运行环境、配置和 `dist` 静态文件：

```powershell
docker build --build-arg APP_VERSION=0.2.28 -t dnsmgr-frontend:local .
$env:DNSMGR_FRONTEND_IMAGE = 'dnsmgr-frontend:local'
$env:DNSMGR_FRONTEND_PORT = '19103'
docker compose up -d
```

默认镜像为 `registry.hanada.info/hanada/dnsmgr-frontend:latest`，宿主机只在 `127.0.0.1:${DNSMGR_FRONTEND_PORT:-19103}` 提供服务。容器内 nginx 监听非特权端口 `8080`，以非 root 用户运行，并明确固定 `worker_processes 1`；常驻 nginx 进程只有一个 master 和一个 worker。

内层 nginx 只负责静态资源、SPA fallback、缓存和 `/healthz`，不代理业务 API。外层 EdgeResty 应先把 `/api/web/v1/`、认证入口、快速登录及后台状态路径路由到 API 服务，再使用项目现有的定制 `proxy_select` 逻辑把页面请求路由到前端容器：

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

## GitHub Actions 镜像发布

每次推送 `main` 都会由 GitHub Actions 在原生 `linux/amd64`、`linux/arm64` Runner 上执行 lint、测试和生产构建。当前 `VERSION` 尚无同名标签时，才向 Harbor、Docker Hub 和 GHCR 发布 `${VERSION}`、`latest` 多架构 manifest，并创建 GitHub tag/release。

镜像分别为 `registry.hanada.info/hanada/dnsmgr-frontend`、`docker.io/hanadalee/dnsmgr-frontend` 和 `ghcr.io/hanadalee/dnsmgr-frontend`。GitHub 仓库需要配置 `HARBOR_USERNAME`、`HARBOR_PASSWORD`、`DOCKERHUB_USERNAME`、`DOCKERHUB_PASSWORD`；GHCR 使用仓库自动提供的 `GITHUB_TOKEN`。根目录 `VERSION` 必须与 `package.json` 完全一致。

## 验证

```powershell
npm run lint
npm test
npm run build
```

生产路径融合、helper 接管 CAS 和原版 dnsmgr 直连方式见 `dnsmgr-helper/docs/openresty-sso.md`。
