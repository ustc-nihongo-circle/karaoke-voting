import { roster } from '../../roster-2026.mjs';
import { normalizeStudentId } from '../../student-id.mjs';

const compactEntry = import.meta.env.VITE_KARAOKE_COMPACT_ENTRY === '1';

export class StudentApi {

    #studentId;

    verifyStudentId(id) {
        return normalizeStudentId(id) !== null;
    }

    constructor(studentId) {
        this.setStudentId(studentId);
    }

    /**
     * @param {string} studentId 
     */
    setStudentId(studentId) {
        this.#studentId = normalizeStudentId(studentId);
    }

    getStudentId() {
        return this.#studentId;
    }

    /**
     * request and update api
     * @param {string} endpoint url
     * @param {object} body parameters
     * @param {string} method
     * @returns {Promise<any>} response
     */
    async #request(endpoint, body, method = 'POST') {
        if (!this.#studentId)
            throw new Error('No student ID!');

        const requestBody = body;

        try {
            const response = await fetch(endpoint, {
                signal: AbortSignal.timeout(15000),
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (response.status === 204)
                return;
            if (!response.ok) {
                let err = await response.json();
                if (err?.error)
                    throw err;
                else
                    throw { error: `Server or HTTP error! status: ${response.status}` };
            }

            const data = await response.json();
            return data;

        } catch (err) {
            console.log(`API request on ${endpoint} with method ${method} failed.`);
            console.error(err);
            throw err;
        }
    }

    /**
     * /vote/get-vote-page-data
     */
    async getVotePageData() {
        const payload = { student_id: this.#studentId };
        if (compactEntry) payload.compact = true;
        const data = await this.#request('/api/vote/get-vote-page-data', payload);
        return compactEntry ? { ...roster, ...data } : data;
    }

    /**
     * /vote/update-vote
     * @param {object} newVotes
     */
    async updateVote(newVotes, round) {
        return await this.#request('/api/vote/update-vote', {
            student_id: this.#studentId,
            new_votes: newVotes,
            round,
        });
    }
}
