import { roster, singers, voteTypes } from '../roster-2026.mjs';
import { allocateAwards, isValidBallot } from './award-results.mjs';
import { normalizeStudentId } from '../student-id.mjs';

const entrantIds = new Set(singers.map(({ id }) => id));
const roundId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

const open = ({ closesAt, serverNow }) => Boolean(closesAt && Date.parse(closesAt) > Date.parse(serverNow));

function currentVotes(votes) {
    if (!votes) return votes;
    return Object.fromEntries(voteTypes.map(({ name }) => {
        const ids = votes[name] ?? (name === 'overall' ? votes.popularity : null) ?? [];
        return [name, ids.filter(id => entrantIds.has(id))];
    }));
}

export function voting2026(query, voterKey) {
    async function tally() {
        const { result } = await query('SELECT public.karaoke_2026_tally() AS result');
        const tallies = singers.map(({ id }) => ({ id, overall: 0, japanese: 0, singing: 0 }));
        const byId = new Map(tallies.map(item => [item.id, item]));
        for (const { category, id, votes } of result.counts) {
            const entrant = byId.get(id);
            const type = category === 'popularity' ? 'overall' : category;
            if (entrant && voteTypes.some(({ name }) => name === type)) entrant[type] += votes;
        }
        return { result, tallies };
    }

    return {
        async read(voter, compact) {
            const id = normalizeStudentId(voter);
            if (!id) return { error: '请输入两位英文字母加八位数字的学号' };
            const { result } = await query('SELECT public.karaoke_2026_read($1) AS result', [voterKey(id)]);
            const ballot = { ...result, votes: currentVotes(result.votes) };
            return compact ? ballot : { ...roster, ...ballot };
        },
        async save(voter, round, votes) {
            const id = normalizeStudentId(voter);
            if (!id) return { error: '请输入两位英文字母加八位数字的学号' };
            if (!roundId.test(round ?? '') || !isValidBallot(votes, entrantIds)) {
                return { error: '选票无效。综合最多 5 票，日语和歌唱各最多 3 票，合计至少一票。同一票种须投给不同的参赛对象。' };
            }
            const { result } = await query('SELECT public.karaoke_2026_save($1, $2, $3) AS result',
                [voterKey(id), round, JSON.stringify(votes)]);
            return { success: result };
        },
        async status() {
            const { result } = await query('SELECT public.karaoke_2026_read(NULL) AS result');
            return { enabled: open(result), round: result.round, closesAt: result.closesAt, serverNow: result.serverNow };
        },
        async results() {
            const { result, tallies } = await tally();
            const enabled = open(result);
            return {
                vote_types: voteTypes,
                singers: tallies.map(({ id, ...total_votes }) => ({
                    id, name: singers.find(singer => singer.id === id).name, total_votes,
                })),
                awards: result.round && !enabled ? allocateAwards(tallies, result.draws) : null,
                draws: result.draws,
                status: { enabled, round: result.round, closesAt: result.closesAt },
            };
        },
        async prepareDraw(round, key, selected) {
            const { result, tallies } = await tally();
            if (!result.round || round !== result.round || open(result)) return false;
            const { pending } = allocateAwards(tallies, result.draws);
            if (!pending || pending.key !== key || !Array.isArray(selected) || selected.length !== pending.seats
                || new Set(selected).size !== selected.length || !selected.every(id => pending.candidates.includes(id))) {
                return false;
            }
            return [round, JSON.stringify(result.draws), key, JSON.stringify(pending.candidates), JSON.stringify(selected)];
        },
    };
}
