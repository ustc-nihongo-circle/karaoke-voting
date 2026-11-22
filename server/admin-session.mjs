import { createHash, randomBytes } from 'node:crypto';

import { readJson } from './read-json.mjs';

const cookie = '__Host-karaoke_admin';
const sessionSeconds = 8 * 60 * 60;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest = value => createHash('sha256').update(`karaoke-admin-session:${value}`).digest('hex');
const failure = (status, error) => Response.json({ error }, { status });

function sessionCookie(token, maxAge) {
    return `${cookie}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

export async function adminRequest(request, url, env, query, voting) {
    if (request.method !== 'POST') return failure(405, '请使用 POST 请求');
    if (request.headers.get('Origin') !== url.origin) return failure(403, '请求来源无效');
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
        return failure(415, '请求格式无效');
    }
    const action = url.pathname.slice('/api/admin/'.length);
    const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-karaoke_admin=([\w-]{43})(?:;|$)/)?.[1];
    const session = token && digest(token);

    if (action === 'login') {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        if (env.ADMIN_LOGIN_LIMIT && !(await env.ADMIN_LOGIN_LIMIT.limit({ key: ip })).success) {
            return failure(429, '登录尝试过多，请稍后再试');
        }
        const credentials = await readJson(request);
        const username = typeof credentials?.username === 'string' ? credentials.username.trim().toLowerCase() : '';
        const password = credentials?.password;
        if (!/^[a-z][a-z0-9_-]{1,31}$/.test(username) || typeof password !== 'string' || !/^[!-~]{12,72}$/.test(password)) {
            return failure(401, '账号或密码有误');
        }
        const nextToken = randomBytes(32).toString('base64url');
        const { result } = await query('SELECT public.karaoke_admin_sign_in($1, $2, $3) AS result',
            [username, createHash('sha256').update(`karaoke-admin-password:${password}`).digest('hex'), digest(nextToken)]);
        if (!result) return failure(401, '账号或密码有误');
        if (session) await query('SELECT public.karaoke_admin_logout($1)', [session]);
        return Response.json({ username }, { headers: { 'Set-Cookie': sessionCookie(nextToken, sessionSeconds) } });
    }

    if (action === 'logout') {
        if (session) await query('SELECT public.karaoke_admin_logout($1)', [session]);
        return Response.json({ success: true }, { headers: { 'Set-Cookie': sessionCookie('', 0) } });
    }

    if (!session) return failure(401, '请登录管理账号');
    const actor = await query('SELECT * FROM public.karaoke_admin_permissions($1)', [session]);
    if (!actor) return failure(401, '管理会话已失效，请重新登录');
    const { username, can_manage_voting: manageVoting, can_resolve_draws: resolveDraws } = actor;

    const manageStaff = username === 'owner';
    if (action === 'get-singers-votes') return Response.json({ ...await voting.results(), username, permissions: { manageVoting, resolveDraws, manageStaff } });
    if (action === 'get-voting-enabled') return Response.json((await voting.status()).enabled);
    if (action === 'list-staff' || action === 'update-staff-permissions') {
        if (!manageStaff) return failure(403, '此账号无权管理 Staff 权限');
        if (action === 'list-staff') {
            const { result } = await query('SELECT public.karaoke_staff_list($1) AS result', [session]);
            return result ? Response.json({ accounts: result }) : failure(403, '管理会话已失效');
        }
        const body = await readJson(request);
        const { username: account, before, after } = body ?? {};
        if (typeof account !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(account)
            || ![before?.manageVoting, before?.resolveDraws, after?.manageVoting, after?.resolveDraws]
                .every(value => typeof value === 'boolean')) return failure(400, '权限设置格式无效');
        if (account === 'owner' || account === 'staff_public') return failure(403, '此账号的权限固定');
        const { result } = await query('SELECT public.karaoke_staff_update_permissions($1, $2, $3, $4, $5, $6) AS result',
            [session, account, before.manageVoting, before.resolveDraws, after.manageVoting, after.resolveDraws]);
        return result ? Response.json({ success: true }) : failure(409, '账号或权限已变化，请重新载入');
    }
    const changesChannel = action === 'set-voting-enabled' || action === 'restore-waiting';
    if (!changesChannel && action !== 'record-draw') return failure(404, '接口不存在');
    if (changesChannel && !manageVoting) return failure(403, '此账号无权更改投票状态');
    if (action === 'record-draw' && !resolveDraws) return failure(403, '此账号无权确认抽签结果');

    const body = await readJson(request);
    if (!body || (body.round !== null && (typeof body.round !== 'string' || !uuid.test(body.round)))) {
        return failure(400, '投票轮次无效');
    }
    if (action === 'set-voting-enabled') {
        if (typeof body.enabled !== 'boolean') return failure(400, '投票状态无效');
        const { result } = await query('SELECT public.karaoke_admin_switch($1, $2, $3) AS result',
            [session, body.round, body.enabled]);
        return result ? Response.json((await voting.status()).enabled) : failure(409, '状态已变化，请刷新后重试');
    }
    if (action === 'restore-waiting') {
        if (!body.round) return failure(400, '请选择已截止的轮次');
        const { result } = await query('SELECT public.karaoke_admin_restore_waiting($1, $2) AS result',
            [session, body.round]);
        return result ? Response.json({ success: true }) : failure(409, '当前轮次或权限已变化，请刷新后核对');
    }
    const prepare = await voting.prepareDraw(body.round, body.key, body.selected);
    if (!prepare) return failure(409, '抽签对象或轮次已变化，请刷新后核对');
    const { result } = await query('SELECT public.karaoke_admin_draw($1, $2, $3, $4, $5, $6) AS result',
        [session, ...prepare]);
    return result ? Response.json({ success: true }) : failure(409, '抽签对象或轮次已变化，请刷新后核对');
}
