// ============================================================
// BTC DCA Worker - Cloudflare Workers + KV
// 处理打卡数据云端存储（多设备同步）
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

    // 防止 user 参数注入（只允许字母数字-_）
    const safeUser = user.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 64) || 'default';
    const key = `dca_${safeUser}`;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // === 加载历史 ===
    // GET /load?user=xxx
    if (request.method === 'GET' && (path === '/load' || path === '/load-history')) {
      try {
        const data = await env.DCA_KV.get(key, 'text');
        const body = data || JSON.stringify({
          version: 1,
          lastUpdated: new Date().toISOString(),
          totalCapital: 100000,
          history: []
        });
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
    // POST /save?user=xxx  body = JSON 数据
    if (request.method === 'POST' && (path === '/save' || path === '/')) {
      try {
        const body = await request.text();
        // 简单验证 body 是合法 JSON
        JSON.parse(body);
        await env.DCA_KV.put(key, body);
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
        endpoints: {
          load: 'GET /load?user=xxx',
          save: 'POST /save?user=xxx'
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    // 404
    return new Response('Not Found. Use GET /load or POST /save', {
      status: 404,
      headers: CORS_HEADERS
    });
  }
};
