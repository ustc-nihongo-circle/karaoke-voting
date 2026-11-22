import assert from 'node:assert/strict';
import test from 'node:test';
import { BodyTooLarge, readJson } from './read-json.mjs';
import { singers } from '../roster-2026.mjs';
import { voting2026 } from './vote-2026.mjs';

function request(body) {
    return new Request('https://example.test/api/vote', { method: 'POST', body });
}

test('JSON reader counts UTF-8 bytes and accepts normal requests', async () => {
    const value = { label: '示例节目' };
    assert.deepEqual(await readJson(request(JSON.stringify(value))), value);
    assert.equal(await readJson(request('')), null);
    assert.equal(await readJson(request('[')), null);
    assert.equal((await readJson(request(JSON.stringify('a'.repeat(8190))))).length, 8190);
    await assert.rejects(readJson(request(JSON.stringify('曲'.repeat(2800)))), BodyTooLarge);
});

test('database refusal on a stale vote is preserved in the API result', async () => {
    const round = '00000000-0000-4000-8000-000000000001';
    const queries = [];
    const voting = voting2026(async (sql, values) => {
        queries.push({ sql, values });
        return { result: false };
    }, () => 'synthetic-test-key');
    const result = await voting.save('ZZ' + '0'.repeat(8), round, { overall: [singers[0].id] });
    assert.deepEqual(result, { success: false });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].values, ['synthetic-test-key', round, JSON.stringify({ overall: [singers[0].id] })]);
});
