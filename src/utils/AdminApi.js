export class AdminAPI {

    /**
     * request and update api
     * @param {string} endpoint url
     * @param {object} body parameters
     * @param {string} method
     * @returns {Promise<any>} response
     */
    async #request(endpoint, body = {}) {
        try {
            const response = await fetch(endpoint, {
                signal: AbortSignal.timeout(15000),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (response.status === 204)
                return;
            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw { status: response.status, error: result?.error || '管理服务暂不可用' };
            }

            const data = await response.json();
            return data;

        } catch (err) {
            throw err;
        }
    }

    async login(username, password) {
        return await this.#request('/api/admin/login', { username, password });
    }

    async logout() {
        return await this.#request('/api/admin/logout');
    }

    /**
     * /admin/get-singers-votes
     */
    async getSingersVotes() {
        return await this.#request('/api/admin/get-singers-votes');
    }

    /**
     * /admin/get-voting-enabled
     */
    async getVotingEnabled() {
        return await this.#request('/api/admin/get-voting-enabled');
    }

    /**
     * /admin/set-voting-enabled
     */
    async setVotingEnabled(newStatus, round) {
        return await this.#request('/api/admin/set-voting-enabled', { enabled: newStatus, round });
    }

    async recordDraw(round, key, selected) {
        return await this.#request('/api/admin/record-draw', { round, key, selected });
    }

    async restoreWaiting(round) {
        return this.#request('/api/admin/restore-waiting', { round });
    }

    async listStaff() {
        return this.#request('/api/admin/list-staff');
    }

    async updateStaffPermissions(username, before, after) {
        return this.#request('/api/admin/update-staff-permissions', { username, before, after });
    }
}
