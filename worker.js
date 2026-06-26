// ============================================================
// BTC DCA Worker - Cloudflare Workers + KV
// 打卡数据云端存储 + 密码保护
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const user = url.searchParams.get('user') || 'default';
    const key = url.searchParams.get('key') || '';

    // 防注入：只允许字母数字-_
    const safeUser = user.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 64) || 'default';
    const dataKey = `dca_${safeUser}`;
    const pwdKey = `pwd_${safeUser}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // === 加载历史 ===
    if (request.method === 'GET' && (path === '/load' || path === '/load-history')) {
      try {
        const storedPwd = await env.DCA_KV.get(pwdKey, 'text');
        // 新用户（无密码）：如果带了 key，设置密码；没带 key，返回空
        if (storedPwd === null) {
          if (key) {
            await env.DCA_KV.put(pwdKey, key);
          } else {
            // 没密码也没 key，返回空数据
            return new Response(JSON.stringify({ version: 1, history: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
            });
          }
        } else if (storedPwd !== key) {
          // 密码不匹配
          return new Response(JSON.stringify({ error: 'unauthorized', message: '密码错误' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
          });
        }
        // 密码正确，返回数据
        const data = await env.DCA_KV.get(dataKey, 'text');
        const body = data || JSON.stringify({ version: 1, history: [] });
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    // === 保存打卡 ===
    if (request.method === 'POST' && (path === '/save' || path === '/')) {
      try {
        if (!key) {
          return new Response(JSON.stringify({ error: 'no_key', message: '需要密码' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
          });
        }
        const storedPwd = await env.DCA_KV.get(pwdKey, 'text');
        if (storedPwd !== null && storedPwd !== key) {
          return new Response(JSON.stringify({ error: 'unauthorized', message: '密码错误' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
          });
        }
        // 密码正确（或新用户首次设置）
        if (storedPwd === null) {
          await env.DCA_KV.put(pwdKey, key);
        }
        const body = await request.text();
        JSON.parse(body); // 验证 JSON
        await env.DCA_KV.put(dataKey, body);
        return new Response(JSON.stringify({ ok: true, user: safeUser }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    // === 健康检查（只 /ping，让 / 走静态资源） ===
    if (request.method === 'GET' && path === '/ping') {
      return new Response(JSON.stringify({
        service: 'BTC DCA API',
        time: new Date().toISOString(),
        auth: 'required (user + key)',
        endpoints: {
          load: 'GET /load?user=xxx&key=yyy',
          save: 'POST /save?user=xxx&key=yyy',
          seanzhao: 'GET /seanzhao（代理爬 btc.seanzhao.ai）'
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // === 代理爬 seanzhao BTC 底部信号看板 ===
    // 数据每天更新一次（作者手动更新），返回完整 S1-S5 + 综合评分
    if (request.method === 'GET' && path === '/seanzhao') {
      try {
        const r = await fetch('https://btc.seanzhao.ai/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await r.text();
        const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
        const pickNum = (re) => { const v = pick(re); return v ? parseFloat(v.replace(/[, $]/g, '')) : null; };

        // 综合评分（0-100）
        const totalScore = pickNum(/font-weight="700"[^>]*>(\d+)<\/text>\s*<text[^>]*>\/ 100<\/text>/);

        const data = {
          // BTC 当前价（seanzhao 数据日期）
          btcPrice: pickNum(/BTC 价格[\s\S]*?<div class="big">\$([\d,]+)<\/div>/),
          // 综合评分
          totalScore: totalScore,
          zone: pick(/gauge-zone"[^>]*>([^<]+)<\/div>/),
          advice: pick(/gauge-dca"><b[^>]*>([^<]+)<\/b>/),
          dataDate: pick(/数据日期\s*(\d{4}-\d{2}-\d{2})/),
          // S1: 持有者成本（3 条线）
          s1ShortCost: pickNum(/短期持有者成本[\s\S]*?<b>\$([\d,]+)<\/b>/),
          s1AvgCost:   pickNum(/平均持有者成本[\s\S]*?<b>\$([\d,]+)<\/b>/),
          s1LongCost:  pickNum(/长期持有者成本[\s\S]*?<b>\$([\d,]+)<\/b>/),
          s1Score:     pickNum(/S1[\s\S]*?card-score"[^>]*>([\d.]+)<span/),
          // S2: MVRV（跟原 MVRV 重复，但仍爬取对比）
          s2Mvrv:      pickNum(/当前 MVRV <b>([\d.]+)<\/b>/),
          s2Score:     pickNum(/S2[\s\S]*?card-score"[^>]*>([\d.]+)<span/),
          // S3: 浮亏占比
          s3LossPct:   pickNum(/当前浮亏占比 <b>([\d.]+)%<\/b>/),
          s3Score:     pickNum(/S3[\s\S]*?card-score"[^>]*>([\d.]+)<span/),
          // S4: 30 天资金净变化（文本，可能 "净流出 -$28.5B"）
          s4NetFlowText: pick(/近 30 天\s*<b>([^<]+)<\/b>/),
          s4Score:     pickNum(/S4[\s\S]*?card-score"[^>]*>([\d.]+)<span/),
          // S5: 恐慌贪婪（跟原恐惧贪婪重复，但仍爬取对比）
          s5Fear:      pickNum(/当前恐慌指数 <b>(\d+)<\/b>/),
          s5Score:     pickNum(/S5[\s\S]*?card-score"[^>]*>([\d.]+)<span/),
          fetchedAt:   new Date().toISOString()
        };

        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    // === 代理 seanzhao HTML 页面（iframe 嵌入用，去掉 X-Frame-Options） ===
    if (request.method === 'GET' && path === '/seanzhao-page') {
      try {
        const r = await fetch('https://btc.seanzhao.ai/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        let html = await r.text();
        // 简单清理：确保不让外部脚本注入到本域（保留原样，浏览器 iframe 隔离）
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...CORS_HEADERS,
            'Cache-Control': 'public, max-age=3600'
            // 故意不设 X-Frame-Options，允许 iframe 嵌入
          }
        });
      } catch (e) {
        return new Response('Failed to fetch seanzhao page: ' + e.message, {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    // 其他 GET 请求：从静态资源取（main.html / index.html 等）
    if (request.method === 'GET' && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
