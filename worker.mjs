import { BodyTooLarge, readJson } from './server/read-json.mjs';
import { Client } from 'pg';
import { createHmac } from 'node:crypto';
import { voting2026 } from './server/vote-2026.mjs';
import { adminRequest } from './server/admin-session.mjs';

const sitePolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function secureResponse(response, path) {
    const headers = new Headers(response.headers);
    headers.set('Strict-Transport-Security', 'max-age=86400');
    headers.set('Referrer-Policy', headers.get('Referrer-Policy') ?? 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    const html = headers.get('Content-Type')?.startsWith('text/html');
    if (html && !headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', sitePolicy);
    if (html || !path.startsWith('/assets/')) headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function queryBallot(binding, query, values) {
    const client = new Client({ connectionString: binding.connectionString, connectionTimeoutMillis: 8000, query_timeout: 12000 });
    try {
        await client.connect();
        const { rows } = await client.query(query, values);
        return rows[0];
    } catch (error) {
        const code = /^[A-Z0-9_]{3,40}$/.test(error.code ?? '') ? error.code : 'DB_ERROR';
        throw new Error(`Vote database unavailable (${code})`);
    } finally {
        await client.end();
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const { pathname } = url;
        if (url.protocol !== 'https:') {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
            }
            url.protocol = 'https:';
            if (pathname === '/admin' || pathname.startsWith('/admin/')) url.search = '';
            return new Response(null, { status: 308, headers: { Location: url.href, 'Cache-Control': 'no-store' } });
        }
        try {
            return secureResponse(await handle(request, url, env), pathname);
        } catch (error) {
            if (error instanceof BodyTooLarge) {
                return secureResponse(Response.json({ error: '请求内容过大' }, { status: 413 }), pathname);
            }
            console.error('Karaoke request failed', pathname.startsWith('/api/admin/') ? 'admin' : 'site');
            return secureResponse(Response.json({ error: '服务暂不可用，请稍后重试' }, { status: 503 }), pathname);
        }
    },
};

async function handle(request, url, env) {
    const { pathname } = url;
    if (request.method === 'GET' && (pathname === '/admin' || pathname.startsWith('/admin/')) && url.search) {
        return new Response(null, { status: 303, headers: { Location: pathname } });
    }
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (pathname === '/api/204') return new Response(null, { status: 204 });
    if (!env.DB || !env.VOTER_HMAC_KEY || !env.ADMIN_LOGIN_LIMIT) {
        return Response.json({ error: '投票服务尚未配置' }, { status: 503 });
    }

    const voterKey = id => createHmac('sha256', env.VOTER_HMAC_KEY).update('karaoke-2026-voter:' + id).digest('hex');
    const query = (sql, values) => queryBallot(env.DB, sql, values);
    const voting = voting2026(query, voterKey);
    if (request.method === 'GET' && pathname === '/api/vote/status') {
        const { enabled, round, closesAt, serverNow } = await voting.status();
        return Response.json({ phase: enabled ? 'open' : round ? 'closed' : 'waiting', closesAt, serverNow });
    }
    if (pathname.startsWith('/api/admin/')) return adminRequest(request, url, env, query, voting);

    if (!['/api/vote/get-vote-page-data', '/api/vote/update-vote'].includes(pathname)) {
        return Response.json({ error: '接口不存在' }, { status: 404 });
    }
    if (request.method !== 'POST') return Response.json({ error: '请使用 POST 请求' }, { status: 405 });
    if (request.headers.get('Origin') !== url.origin) return Response.json({ error: '请求来源无效' }, { status: 403 });
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
        return Response.json({ error: '请求格式无效' }, { status: 415 });
    }
    const body = await readJson(request);
    if (!body || typeof body !== 'object') return Response.json({ error: '请求格式无效' }, { status: 400 });
    const result = pathname.endsWith('/get-vote-page-data')
        ? await voting.read(body.student_id, body.compact === true)
        : await voting.save(body.student_id, body.round, body.new_votes);
    return Response.json(result, { status: result.error ? 400 : 200 });
}
