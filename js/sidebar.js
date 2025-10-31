const STAT_SUCCESS_CLASS = 'stat-card--success';

export class SidebarController {
  constructor({ root, statList }) {
    this.root = root;
    this.statList = statList;
    this.statItems = this.buildStatMap();
  }

  buildStatMap() {
    if (!this.statList) return {};
    const items = {};
    this.statList.querySelectorAll('[data-stat-id]').forEach((card) => {
      const id = card.dataset.statId;
      if (!id) return;
      const valueEl = card.querySelector('[data-stat-value]');
      items[id] = { card, valueEl };
    });
    return items;
  }

  setStat(id, { value, emphasize = false, hidden } = {}) {
    const item = this.statItems[id];
    if (!item) return;

    if (typeof value !== 'undefined' && item.valueEl) {
      item.valueEl.textContent = value;
    }

    if (typeof hidden !== 'undefined') {
      if (hidden) {
        item.card.setAttribute('hidden', '');
      } else {
        item.card.removeAttribute('hidden');
      }
    }

    if (emphasize) {
      item.card.classList.add(STAT_SUCCESS_CLASS);
    } else {
      item.card.classList.remove(STAT_SUCCESS_CLASS);
    }
  }

  resetStats() {
    Object.values(this.statItems).forEach(({ card }) => card.classList.remove(STAT_SUCCESS_CLASS));
  }

  getRoot() {
    return this.root;
  }
}

export const initSidebar = () => {
  const root = document.querySelector('.sidebar');
  if (!root) {
    return null;
  }

  const statList = root.querySelector('[data-stat-list]');
  return new SidebarController({ root, statList });
};

export default initSidebar;
