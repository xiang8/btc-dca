# 定投策略 - BTC 每日定投看板

## 项目用途
BTC 每日定投决策工具：信号 + 时间 + 价格 三维度，决定今天该投多少。
单 HTML 文件，可独立分发（完整看板已内嵌）。

## 文件清单

| 文件 | 说明 |
|------|------|
| `main.html` | **主文件**（3187 行 / ~130KB，整合所有功能） |
| `index.html` | main.html 的同步副本（云端部署用） |
| `启动看板.bat` | 双击启动（最小化启动 PowerShell） |
| `start-server.ps1` | PowerShell HTTP 服务器（Windows 自带，无需 Python） |
| `worker.js` | Cloudflare Worker 后端（打卡云端存储 + 密码保护） |
| `wrangler.toml` | Cloudflare Worker 配置（worker 名 `btc-dca`） |
| `btc_dca_history.json` | 运行时自动生成的打卡记录（首次启动创建） |

## 主文件架构（每日定投.html）

### 1. 顶部信号栏（7 指标加权投票）
- AHR999（30%）：`<0.4 加大买入 / 0.4-0.7 定投 / >0.7 等待`
- MVRV-Z（20%）：`<0.5 加大 / 0.5-3 定投 / >3 等待`
- 恐惧贪婪（15%）：`<20 加大 / 20-50 定投 / >50 等待`
- MVRV（10%）：`<1.2 加大 / 1.2-2.5 定投 / >2.5 等待`
- SOPR（10%）：`<0.97 加大 / 0.97-1.03 定投 / >1.03 等待`
- Puell（10%）：`<0.5 加大 / 0.5-1.5 定投 / >1.5 等待`
- 200WMA（5%）：`<1.0x 加大 / 1.0-1.5x 定投 / >1.5x 等待`

综合信号 → 倍数：加仓 ×1.5 / 定投 ×1.0 / 等待 ×0.5

### 2. 每日定投（价格 × 时间 × 信号）

| 价格 | 试探期 (2026-07~12) | 加仓期 (2027-01~03) | 梭哈期 (2027-04+) |
|------|---------------------|---------------------|-------------------|
| > 7w | 0 | 0 | 0 |
| 6-7w | 0.05% | 0.10% | 0.20% |
| 5-6w | 0.10% | 0.20% | 0.40% |
| 4-5w | 0.20% | 0.40% | 0.80% |
| 3-4w | 0.50% | 1.00% | 2.00% |
| < 3w | 一次性 5% | 一次性 10% | 一次性 20% |

阶段累计上限：试探 30% / 加仓 60% / 梭哈 90%

**今日应投** = 基础（价格×时间）× 信号倍数

### 3. 完整看板模态框（📊 按钮）
- `<template id="cloneTemplate">` 内嵌 btc看板_克隆 完整 HTML
- 模态框打开时通过 `iframe.srcdoc` 注入
- 包含 17 指标（200WMA/BP/MVRV/MVRV-Z/SOPR/Puell/减半倒计时/VWAP/相关性/跌破概率/mNAV/STRC 飞轮/矿机关机价）

### 4. Tab 切换（两个）

| Tab | 内容 |
|-----|------|
| 📅 每日定投 | 时间 × 价格 × 信号 三维定投（默认） |
| 💰 价格一次性买入 | 7 档价格区间 → 目标仓位分配 + 分批挂单 |

### 5. 价格一次性买入 tab（PRICE_TIERS）

7 档区间 → 累计仓位（取中位数）→ 该档新增仓位 → 该档金额（基于总资金）

| 档位 | 价格区间 | 累计仓位 | 新增仓位 | 状态 |
|------|---------|---------|---------|------|
| 0 | ≥ 6.0w | 0% | 0% | 观望 |
| 1 | 5.7w–6.0w | 5% | 5% | 试探 |
| 2 | 5.1w–5.7w | 15% | 10% | 预留子弹 |
| 3 | 4.5w–5.1w | 35% | 20% | 分批建仓 |
| 4 | 4.0w–4.5w | 55% | 20% | 重仓区 |
| 5 | 3.5w–4.0w | 75% | 20% | 恐慌区 |
| 6 | < 3.5w | 100% | 25% | 极限恐慌 |
| **合计** | | | **100%** | |

**分批挂单**：
- tab 顶部下拉选「每档分批 1/3/5/10 笔」（默认 3 笔）
- 🎲 重新随机零头按钮
- 每档行尾 ▼ 展开分批明细（序号 / 挂单价 / 金额 / 买入 BTC）
- 价格零头：每笔 +10~50u 随机（避开整数墙）
- 金额零头：每笔 ±8% 随机，**末笔补齐**保证总和 = 该档总额
- 价格分布：区间内 `(k+0.5)/N` 等分位置

### 6. 信号矩阵「❓ 指标说明」面板
- 矩阵标题右侧按钮，点击 toggle `#indicatorHelp` 面板
- 7 张 help-card（AHR999/MVRV-Z/恐惧贪婪/MVRV/SOPR/Puell/200WMA）
- 每张：公式 + 阈值含义（buy/dca/wait 三档色标）

### 7. VANTA.FOG 雾效果背景
- `<div id="vanta-bg">` fixed 全屏 z-index:-1
- CDN：`three.r134.min.js` + `vanta.fog.min.js`（body 末尾加载）
- 颜色参数：highlightColor `0xffc300` / midtoneColor `0xff1f00` / lowlightColor `0x2d00ff` / baseColor `0xffebeb`
- 其他：blurFactor 0.6 / zoom 1 / speed 1
- body 背景 `transparent !important`，VANTA 透出来，卡片背景保持深色叠在上面
- `pointer-events: none` 不阻挡交互
- 初始化用 lazy retry（等 VANTA library 加载完）

### 8. 首次访问初始化界面
- `#initOverlay` 模态层：用户名 + 密码 + 总资金（首次访问必填）
- 总资金无默认值，autocomplete off

### 9. 密码保护 + 云端同步
- `WORKER_URL` 常量（main.html 内）：Cloudflare Worker URL
- 用户名 + 密码（USER_ID / USER_KEY）：URL 参数 > localStorage
- `saveToServer()` 自动 POST 到 Worker（失败 fallback 浏览器存储）

## 数据源

| 类型 | API |
|------|-----|
| BTC 价格 / K 线 | Binance（fallback: OKX） |
| 恐惧贪婪 | `api.alternative.me/fng/` |
| 区块 / 算力 | `mempool.space` |
| 链上指标 (MVRV/SOPR/Puell/BP/mNAV) | `looknode-proxy.corms-cushier-0l.workers.dev` |
| MVRV-Z | `btc-cache.corms-cushier-0l.workers.dev` |
| AHR999 / 200WMA | 本地计算 |

### AHR999 公式
```
AHR999 = (现价 / 200日定投成本) × (现价 / 指数增长估值)
指数增长估值 = 10^[5.84 × log10(币龄天数) - 17.01]
币龄 = 距 2009-01-03 创世区块的天数
```

## 启动方式

### 方式 1：双击 启动看板.bat（推荐，完整功能）
- bat 调用 `start-server.ps1`（PowerShell，Windows 自带）
- PowerShell 起服务（端口 8765）+ 自动创建 `btc_dca_history.json` + 自动开浏览器
- 打卡自动 POST `/save` 写入 JSON
- **心跳机制**：页面每 5 秒 ping `/heartbeat`，关闭浏览器后 20 秒 PowerShell 自动关闭
- bat 窗口一闪而过，PowerShell 最小化到任务栏

### 方式 2：双击 每日定投.html（简单，无文件保存）
- 直接双击 HTML（file://）
- 所有功能正常，但打卡只存 localStorage
- 关闭浏览器数据不丢（除非清缓存）

## PowerShell 服务器端点（start-server.ps1）

| 端点 | 方法 | 功能 |
|------|------|------|
| `GET /` 或 `GET /每日定投.html` | GET | 返回 HTML |
| `GET /load-history` | GET | 返回 btc_dca_history.json 内容 |
| `POST /save` | POST | 接收 body，写入 btc_dca_history.json |
| `GET /heartbeat` | GET | 更新心跳时间戳 |
| 其他静态文件 | GET | 返回对应文件（CSS/JS/图片等） |

## 打卡数据存储
- **localStorage**（始终）：浏览器存储，浏览器/清缓存/移动文件会丢
- **btc_dca_history.json**（通过 bat 启动）：本地文件，自动写入，最可靠

## 技术栈
- 单 HTML 文件（无构建）
- 内联 CSS + 原生 JS
- `<template>` + `iframe.srcdoc` 实现内嵌看板（JS 隔离）
- PowerShell HttpListener（本地服务器）
- 心跳机制（异步 GetContext + 超时检查）
- **VANTA.FOG + three.js r134**（雾效果背景，CDN 加载）
- Cloudflare Workers + KV（云端打卡存储 + 密码验证）

## 关键 Bug 修复记录
- `computeSignal` 加 `isNaN` 检查 + zone fallback（避免 NaN 导致渲染中断）
- `render()` 每个子函数独立 `try/catch`（避免局部错误导致整体空白）
- PowerShell 脚本编码：全英文注释（避免中文导致 5.1 解析错误）
- 文件名用英文（`start-server.ps1`），中文文件名内部用 Unicode 转义
- **`renderToday` 加 null 防御**：集中取 DOM 元素 → 任一为 null 就 return（防御云端 HTML 旧版导致 `badge.className` 报错）
- **金额零头 ±8%**（原 ±3% 不明显）：末笔补齐保证总和 = 该档总额
- **VANTA 初始化用 lazy retry**：等 `window.VANTA.FOG` 就绪后再调用（避免 library 未加载完）

## 来源
- 完整看板（template 内嵌部分）来自 [fuckbtc.com](https://fuckbtc.com/)，原作者 [bitfish](https://x.com/bitfish)
- 链上 Workers 代理由 bitfish 搭建，**强依赖作者维护**
- 其他逻辑为 bbxiang 定制

## 打包分发（3 个文件）
```
main.html
启动看板.bat
start-server.ps1
```
接收者双击 `启动看板.bat` 即可使用。
