import { createHash } from 'node:crypto';
import { Client } from 'pg';

const account = process.argv[2];
const password = process.env.KARAOKE_STAFF_PASSWORD;
if (!/^[a-z][a-z0-9_-]{1,31}$/.test(account ?? '') || !/^[!-~]{12,72}$/.test(password ?? '') || !process.env.DATABASE_URL) {
    throw new Error('需要有效的账号名、KARAOKE_STAFF_PASSWORD 和 DATABASE_URL');
}
const verifier = createHash('sha256').update('karaoke-admin-password:' + password).digest('hex');
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
    await client.connect();
    await client.query(`INSERT INTO public.karaoke_admin_accounts
        (username, password_hash, can_manage_voting, can_resolve_draws)
        VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 12)), $3, $3)`, [account, verifier, account === 'owner']);
    console.log('工作人员账号已创建');
} finally {
    await client.end();
}
