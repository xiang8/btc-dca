# 定投策略 - BTC 每日定投看板

## 项目用途
BTC 每日定投决策工具：价格档位 × 10 链上指标信号 × 自定义分摊天数。
单 HTML 文件 + Cloudflare Worker（云端打卡 + 子琦数据代理）。

## 文件清单

| 文件 | 说明 |
|------|------|
| `main.html` | **主文件**（~3500 行 / ~140KB，整合所有功能） |
| `index.html` | main.html 的同步副本（**改 main.html 后必须 cp 到 index.html**） |
| `worker.js` | Cloudflare Worker（打卡 KV + 子琦爬虫代理 + HTML 不缓存） |
| `wrangler.toml` | Worker 配置（KV 绑定 DCA_KV + Static Assets） |
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

### 顶部输入区（手机端移到底部）
- 用户名 / 密码（**readonly**，初始定死）
- 总资金 / 已持仓 BTC / 持仓均价 / 分摊天数（可改，localStorage 持久化）
- 重算 / 导出 JSON

### 信号栏
- BTC 现价（Binance fallback OKX）
- 综合信号（10 指标加权，6 档 emoji + 倍数）
- 投票分布条（加仓/定投/等待）

### 信号矩阵（5×2 grid，10 卡片）
- 每张：指标名 + 权重 + 当前值 + zone label
- 「❓ 指标说明」按钮 → 展开面板（10 张 help-card）

### 今日定投卡
- 当前价格档位 + 目标仓位 + 信号倍数 + 今日应投 + reason
- reason 例：「超强仓 ×1.5 · 每日 0.1008% 总资金（100%/248天 × 0.5x）· 加仓7票」

### 价格档位表（renderTierMatrix）
- 7 行，显示**今日实际%**（基础 × mult × signalMult）
- 当前价档位高亮（金色背景 + 👈）
- 手机端横向滚动

### 累计投入进度
- 已有持仓（初始 BTC × 均价）显示
- 累计含初始金额
- 总资金消耗进度条

### 执行历史
- 加权均价 + 累计持仓 BTC

### Tab 切换
- 📅 每日定投（默认）
- 💰 价格一次性买入（7 档分批挂单，区间内分 1/3/5/10 笔，价格零头 1-50u 随机避开整数墙）

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
- 信号栏 / 今日卡 单列或 2 列
- 表格 `overflow-x: auto` + `touch-action: pan-x` + `min-width: 560px`
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

## 来源
- 完整看板（template 内嵌）：[fuckbtc.com](https://fuckbtc.com/)，作者 [bitfish](https://x.com/bitfish)
- 链上指标代理（looknode-proxy / btc-cache）：bitfish 搭建
- 底部信号数据（S1/S3/S4 + 综合评分）：[btc.seanzhao.ai](https://btc.seanzhao.ai/)，作者 [子琦 @Seanzhao1105](https://x.com/Seanzhao1105)
- 其他逻辑：bbxiang 定制
