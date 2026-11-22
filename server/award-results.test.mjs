import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateAwards, isValidBallot } from './award-results.mjs';

const ids = new Set([1, 2, 3, 4, 6, 7]);
const row = (id, overall = 0, japanese = 0, singing = 0) => ({ id, overall, japanese, singing });

test('only competition entries share the five / three / three quotas', () => {
    const five = [1, 2, 3, 4, 6];
    assert.ok(isValidBallot({ overall: five, japanese: five.slice(0, 3), singing: five.slice(0, 3) }, ids));
    for (const ballot of [{}, { overall: [...five, 7] }, { japanese: five.slice(0, 4) },
        { singing: five.slice(0, 4) }, { overall: [1, 1] }, { overall: [5] }, { popularity: [1] }]) {
        assert.equal(isValidBallot(ballot, ids), false);
    }
});

test('overall prizes break equal totals by overall votes, then singing votes', () => {
    const result = allocateAwards([row(1, 3, 1, 6), row(2, 5, 1, 4), row(3, 5, 0, 5)]);
    assert.deepEqual(result.winners[0], { award: 'first', id: 3 });
});

const previousWinners = [
    ...Array.from({ length: 9 }, (_, i) => row(i + 1, 100 - i)),
    row(10, 0, 9, 9), row(11, 0, 9), row(12, 0, 0, 8),
    row(13, 0, 8), row(14, 0, 0, 7), row(15, 0, 7),
];

test('technical awards alternate; popularity ranks remaining entrants by total, including zero overall votes', () => {
    const result = allocateAwards([...previousWinners, row(16, 0, 3, 3), row(17, 5), row(18, 1, 1, 2), row(19, 3)]);
    assert.equal(result.pending, null);
    assert.equal(new Set(result.winners.map(w => w.id)).size, 18);
    assert.deepEqual(result.winners.slice(9).map(w => [w.award, w.id]), [
        ['singing', 10], ['japanese', 11], ['singing', 12], ['japanese', 13],
        ['singing', 14], ['japanese', 15], ['popularity', 16], ['popularity', 17], ['popularity', 18],
    ]);
});

test('equal totals at the last popularity seat require a draw even with different overall counts', () => {
    const tallies = [...previousWinners, row(16, 6), row(17, 5), row(18, 4), row(19, 0, 2, 2)];
    const { pending } = allocateAwards(tallies, { 'popularity:3': [18] });
    assert.deepEqual(pending.candidates, [18, 19]);
    assert.equal(pending.seats, 1);
    assert.deepEqual(allocateAwards(tallies, { [pending.key]: [19] }).winners.at(-1), { award: 'popularity', id: 19 });
    assert.throws(() => allocateAwards(tallies, { [pending.key]: [1] }), RangeError);
});

test('zero totals leave popularity seats vacant', () => {
    const result = allocateAwards([...previousWinners, row(16, 0, 1), row(17)]);
    assert.deepEqual(result.vacancies, [{ award: 'popularity', seats: 2 }]);
});

