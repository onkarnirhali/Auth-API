'use strict';

class AdminService {
  constructor(repository) {
    this.repo = repository;
  }

  async getSummary({ activeWindowHours }) {
    const totalUsers = await this.repo.countUsersTotal();
    const activeSince = this.computeActiveSince(activeWindowHours);
    const activeUsers24h = await this.repo.countActiveUsersSince(activeSince);
    return { totalUsers, activeUsers24h };
  }

  async listUsers({ limit, offset, role }) {
    const total = await this.repo.countUsersTotal({ role });
    const items = await this.repo.listUsersWithMetrics({ limit, offset, role });
    return { total, items };
  }

  async listEvents({ limit, offset, type, userId }) {
    const total = await this.repo.countEvents({ type, userId });
    const items = await this.repo.listEvents({ limit, offset, type, userId });
    return { total, items };
  }

  async listIntegrations({ limit, offset }) {
    const total = await this.repo.countUsersTotal();
    const items = await this.repo.listIntegrations({ limit, offset });
    return { total, items };
  }

  async updateUserFlags({ id, role, isEnabled }) {
    return this.repo.updateUserFlags({ id, role, isEnabled });
  }

  computeActiveSince(activeWindowHours) {
    const hours = Number.isFinite(Number(activeWindowHours)) ? Number(activeWindowHours) : 24;
    const ms = Math.max(1, hours) * 60 * 60 * 1000;
    return new Date(Date.now() - ms);
  }
}

module.exports = {
  AdminService,
};
