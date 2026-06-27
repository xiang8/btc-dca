# 定投策略 - BTC 每日定投看板

## 项目用途
BTC 每日定投决策工具：价格档位 × 10 链上指标信号 × 自定义分摊天数。
单 HTML 文件 + Cloudflare Worker（云端打卡 + 子琦数据代理）。

## 文件清单

| 文件 | 说明 |
|------|------|
| `main.html` | **主文件**（~3500 行 / ~165KB，整合所有功能） |
| `index.html` | main.html 的同步副本（**改 main.html 后必须 cp 到 index.html**） |
| `worker.js` | Cloudflare Worker（打卡 KV + 子琦爬虫代理 + HTML 不缓存） |
| `wrangler.toml` | Worker 配置（KV 绑定 DCA_KV + Static Assets） |
| `.gitignore` | 排除 `btc_dca_history.json` / `.claude/` / `.vercel/` / `.env` 等 |
| `启动看板.bat` / `start-server.ps1` | 本地 PowerShell 启动（可选） |

## 部署
- **Cloudflare Workers 自动部署**（git push → 自动 deploy）
- 自定义域名：`btcdca.005718.xyz`
- Worker URL：`https://btc-dca.hjvjbcjjvnk.workers.dev`（备份）
- Worker 端点：`/load` `/save`（打卡）/ `/seanzhao`（子琦 JSON）/ `/seanzhao-page`（子琦 iframe）/ `/ping`

## 核心计算逻辑

### 每日定投公式
```
每日% = (100% / 分摊天数) × 档位 mult × signalMult
今日金额 = 总资金 × 每日% / 100
```

### 价格档位（PRICE_TIERS，7 档 mult 加速）
| 价格档位 | mult | 248 天基准下满需 |
|---------|------|----------------|
| >6w | 0.5 | 496 天 |
| 5.7-6w | 1 | 248 天 |
| 5.1-5.7w | 1.5 | 165 天 |
| 4.5-5.1w | 2 | 124 天 |
| 4.0-4.5w | 3 | 83 天 |
| 3.5-4.0w | 4 | 62 天 |
| <3.5w | 8 | 31 天 |

### 分摊天数（distributeDays）
- 默认动态算到 **2027-03-01**（`Math.ceil((TARGET - now)/day)`）
- 用户可在主页「分摊天数」输入框改（localStorage 持久化）
- 初始化界面点击输入框自动填推荐值

### signalMult（10 指标加权投票 → 6 档）
| 信号 | 触发 | 倍数 |
|------|------|------|
| 减仓 sell | 观望票 ≥ 7 | ×0 |
| 超强仓 superbuy | 加仓票 ≥ 70% | ×1.5 |
| 加仓 buy | 加仓票 50-70% | ×1.2 |
| 定投 dca | 定投占多 + 加仓 ≥ 2 | ×1.0 |
| 警惕 caution | 定投占多 + 加仓 < 2 | ×0.7 |
| 等待 wait | 其他 | ×0.3 |

### 10 指标权重（sum=100%）
| 指标 | 权重 | 数据源 |
|------|------|--------|
| AHR999 | 25 | 本地计算 |
| MVRV-Z | 15 | btc-cache |
| 恐惧贪婪 | 10 | alternative.me |
| MVRV | 10 | looknode-proxy |
| SOPR | 10 | looknode-proxy |
| Puell | 10 | looknode-proxy |
| 200WMA | 5 | 本地计算 |
| LTH 持有者成本 | 5 | **Worker /seanzhao** |
| 浮亏占比 | 5 | **Worker /seanzhao** |
| 资金流 | 5 | **Worker /seanzhao** |

### 停投规则（任一触发）
1. 加仓票 < 4
2. 观望票 > 5（过半）
3. 已投满 100% 总资金

## 主文件结构

### 顶部输入区（config-panel）
- 用户名 / 密码（**readonly**，初始定死）
- 总资金 / 已持仓 BTC / 持仓均价 / 分摊天数（可改，localStorage 持久化）
- **桌面端**：6 输入框 grid 3 列（2 行 3 列），下方 actions（重算/保存状态/导出）**居中**
- **手机端**：单列堆叠（`grid-template-columns: 1fr`），整体 order:99 移到底部

### 信号栏
- BTC 现价（Binance fallback OKX）
- 综合信号（10 指标加权，6 档 emoji + 倍数）
- 投票分布条（加仓/定投/等待）

### 信号矩阵（5×2 grid，10 卡片）
- 每张：指标名 + 权重 + 当前值 + zone label
- 「❓ 指标说明」按钮 → 展开面板（10 张 help-card）

### 今日定投卡（today-card）
- 当前价格档位 + 目标仓位 + 信号倍数 + 今日应投 + reason
- reason 例：「超强仓 ×1.5 · 每日 0.1008% 总资金（100%/248天 × 0.5x）· 加仓7票」
- **桌面端**：4 格横排（grid 1fr×4）
- **手机端**：前 2 格（当前阶段/价格区间）2 列，后 2 格（信号倍数/今日应投）各占整行（`nth-last-child(-n+2) { grid-column: span 2 }`），适配 4-5 位金额

### 价格档位表（renderTierMatrix）
- 7 行，显示**今日实际%**（基础 × mult × signalMult）
- 当前价档位高亮（金色背景 + 👈）
- **手机端**：横向滚动（`overflow-x: auto !important` 强制覆盖基础 `overflow: hidden`）

### 累计投入进度
- 已有持仓（初始 BTC × 均价）显示
- 累计含初始金额
- 总资金消耗进度条

### 执行历史
- 加权均价 + 累计持仓 BTC

### Tab 切换
- 📅 每日定投（默认）
- 💰 价格一次性买入（7 档分批挂单，区间内分 1/3/5/10 笔，价格零头 1-50u 随机避开整数墙）
- **手机端**：挂单列（col-action）`position: sticky; right: 0`，横向滚动时 ▼ 按钮始终可见（带 `var(--card2)` 不透明背景遮挡）

### 完整看板模态框（双 tab）
- 🐟 神鱼看板（template 内嵌 fuckbtc.com 完整 HTML，iframe srcdoc）
- 🎯 子琦看板（iframe src = Worker /seanzhao-page 代理）

## 背景
- **VANTA.WAVES**（深蓝 0x5588）+ 暗化遮罩 `rgba(10,14,26,0.55→0.7)`
- 卡片玻璃态：`backdrop-filter: blur(16px) saturate(160%)`
- `--card: rgba(20,26,46,0.78)` 半透明

## 缓存策略
- **worker.js 对 HTML 加 `Cache-Control: no-cache, no-store`**
- 用户每次拿最新 HTML，**不需要清缓存**
- localStorage 不受影响（登录/数据全保留）

## 手机适配（@media max-width:768px）
- `.container` flex column，**config-panel order:99 移到底部**（进入就看到今日定投）
- **today-card**：前 2 格 2 列，后 2 格（信号倍数/今日应投）各 `grid-column: span 2` 占满整行；`.today-item { min-width: 0 }` 修 grid 撑爆
- **config-panel**：`.config-inputs` 单列（`grid-template-columns: 1fr`）
- **表格**：`overflow-x: auto !important` + `overflow-y: hidden` + `touch-action: pan-x` + `min-width: 560px`
- **挂单列 sticky right**：滚动时 ▼ 按钮始终可见
- 模态框 98% 宽
- 按钮最小 36px 高（触摸友好）

## ⚠️ 开发规则（bbxiang 要求）

### 1. 电脑端改动必须同步手机适配
**任何 UI 改动**（加元素/改布局/改样式）必须同时考虑手机端：
- 检查 `@media (max-width: 768px)` 是否需要加规则
- 新增 input/button 要在手机端测可点
- 新增表格/grid 要在手机端测可滚动
- 新增元素要在手机端 confirm 不撑破布局

### 2. main.html 改完必须同步 index.html
```bash
cp main.html index.html
```
两个文件必须内容一致（Cloudflare 部署 index.html 作为入口）。

### 3. commit 前 JS 语法检查
```bash
node -e "new Function(require('fs').readFileSync('main.html','utf8').match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g).sort((a,b)=>b.length-a.length)[0].match(/>([\s\S]*?)<\/script>/)[1])"
```

### 4. 删 HTML 元素必须同时删 JS 事件
之前删「应用用户名」按钮 HTML 但留 JS 事件 → `getElementById` 返回 null → 整个 script 中断 → 页面空白。

### 5. 不擅自加优化
按 bbxiang 指令执行，不擅自加"改进"。

## 关键 Bug 修复记录
- `renderToday` 用 `innerHTML` 一次性生成 multEl（避免 textContent 清空 multBadge span）
- `computeSignal` 加 `isNaN` 检查 + zone fallback
- `render()` 每个子函数独立 `try/catch`
- `generateTierOffsets` 后存 localStorage（记忆分批选择）
- `expandedTiers` Set 保留展开状态（避免定时刷新收回）
- worker.js wrangler.toml 加 KV 绑定（避免 git deploy 覆盖手动绑定）
- worker.js 加 Static Assets（让 Worker 服务 HTML）
- worker.js HTML 加 no-store（用户不用清缓存）
- PRICE_TIERS 边界：>6w min=60001（让 60000 落入 5.7-6w 档）
- applyUserBtn 删除时同步删 JS 事件（避免 null.addEventListener 中断脚本）
- **手机端 .matrix-wrap 横滑失效** → `overflow-x: auto !important`（基础规则 `overflow: hidden` 在媒体查询之后，反向覆盖了；用 !important 强制）
- **手机端 today-card 今日应投被挤出** → grid 默认 `min-width: auto` 撑爆 grid；改 `.today-item { min-width: 0 }` + 后 2 格 `grid-column: span 2` 占整行，4-5 位金额也能放下
- **手机端挂单列看不到** → `position: sticky; right: 0`，滚动时 ▼ 按钮始终可见，带 `var(--card2)` 不透明背景
- **加 .gitignore** → 防止 `btc_dca_history.json`（本地打卡数据）被 push 到 GitHub 泄露

## 迁移评估记录（未实施）
- **Vercel 迁移**评估过但放弃：Vercel 默认 `*.vercel.app` 域名在国内同样存在 DNS 污染问题（跟 `*.workers.dev` 一样），单纯迁移不解决访问问题
- 真正解法是**自定义域名**（任意平台都行），目前用 Cloudflare Worker + 自定义域名 `btcdca.005718.xyz`
- 前端直连 `looknode-proxy.corms-cushier-0l.workers.dev` / `btc-cache.corms-cushier-0l.workers.dev`（bitfish 的 Workers）→ **国内被墙，链上指标（MVRV/SOPR/Puell/mNAV/BP/MVRV-Z）显示不出来**
- 解决方案候选：开 VPN / Worker 绑自定义域名后做前端代理改造（Worker 在墙外替浏览器拉 workers.dev）

## 来源
- 完整看板（template 内嵌）：[fuckbtc.com](https://fuckbtc.com/)，作者 [bitfish](https://x.com/bitfish)
- 链上指标代理（looknode-proxy / btc-cache）：bitfish 搭建
- 底部信号数据（S1/S3/S4 + 综合评分）：[btc.seanzhao.ai](https://btc.seanzhao.ai/)，作者 [子琦 @Seanzhao1105](https://x.com/Seanzhao1105)
- 其他逻辑：bbxiang 定制
