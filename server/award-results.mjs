import { voteTypes } from '../roster-2026.mjs';

const limits = new Map(voteTypes.map(type => [type.name, type.max_per_user]));

const rounds = [
    { award: 'first', seats: 1 },
    { award: 'second', seats: 3 },
    { award: 'third', seats: 5 },
    { award: 'singing', seats: 1, turn: 1 },
    { award: 'japanese', seats: 1, turn: 1 },
    { award: 'singing', seats: 1, turn: 2 },
    { award: 'japanese', seats: 1, turn: 2 },
    { award: 'singing', seats: 1, turn: 3 },
    { award: 'japanese', seats: 1, turn: 3 },
    { award: 'popularity', seats: 3 },
];

export function isValidBallot(ballot, entrantIds) {
    if (!ballot || typeof ballot !== 'object' || Array.isArray(ballot)) return false;
    const selections = Object.entries(ballot);
    return selections.every(([type, ids]) => limits.has(type)
        && Array.isArray(ids) && ids.length <= limits.get(type) && new Set(ids).size === ids.length
        && ids.every(id => entrantIds.has(id)))
        && selections.some(([, ids]) => ids.length > 0);
}

function scoreFor(entrant, award) {
    if (award === 'popularity') return [entrant.total];
    if (award === 'singing' || award === 'japanese') return [entrant[award], entrant.total];
    return [entrant.total, entrant.overall, entrant.singing];
}

function compare(left, right) {
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
}

// A draw selects exactly the available seats from the tied group at that step.
export function allocateAwards(tallies, drawSelections = {}) {
    const entrants = tallies.map(({ id, overall, japanese, singing }) => {
        if (![overall, japanese, singing].every(count => Number.isSafeInteger(count) && count >= 0)) {
            throw new TypeError('Vote tallies must be nonnegative integers');
        }
        return { id, overall, japanese, singing, total: overall + japanese + singing };
    });
    if (new Set(entrants.map(({ id }) => id)).size !== entrants.length) {
        throw new TypeError('Entrant IDs must be unique');
    }

    const winners = [];
    const awarded = new Set();
    const vacancies = [];

    for (const { award, seats, turn } of rounds) {
        const ranked = entrants.filter(entrant => !awarded.has(entrant.id))
            .map(entrant => ({ id: entrant.id, score: scoreFor(entrant, award) }))
            .filter(candidate => candidate.score[0] > 0)
            .sort((a, b) => compare(a.score, b.score));

        let filled = 0;
        while (filled < seats && filled < ranked.length) {
            const { score } = ranked[filled];
            const remainingSeats = seats - filled;
            const tied = ranked.slice(filled).filter(candidate => compare(score, candidate.score) === 0)
                .map(candidate => candidate.id);
            let selected = tied;
            if (tied.length > remainingSeats) {
                // Draws from the earlier roster and award rules belong to a different candidate pool.
                const key = `${award}:${turn ?? filled + 1}:nov18`;
                selected = drawSelections[key];
                if (selected === undefined) {
                    return { winners, vacancies, pending: {
                        type: 'draw', key, award, seats: remainingSeats, candidates: tied,
                    } };
                }
                if (!Array.isArray(selected) || selected.length !== remainingSeats
                    || new Set(selected).size !== selected.length || !selected.every(id => tied.includes(id))) {
                    throw new RangeError(`Invalid draw selection for ${key}`);
                }
            }
            for (const id of selected) {
                awarded.add(id);
                winners.push({ award, id });
            }
            filled += selected.length;
        }
        if (filled < seats) vacancies.push({ award, seats: seats - filled, ...(turn ? { turn } : {}) });
    }

    return { winners, vacancies, pending: null };
}
