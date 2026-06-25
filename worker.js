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

    // === 健康检查 ===
    if (request.method === 'GET' && (path === '/' || path === '/ping')) {
      return new Response(JSON.stringify({
        service: 'BTC DCA API',
        time: new Date().toISOString(),
        auth: 'required (user + key)',
        endpoints: {
          load: 'GET /load?user=xxx&key=yyy',
          save: 'POST /save?user=xxx&key=yyy'
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
