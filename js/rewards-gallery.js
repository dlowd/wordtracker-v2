const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

export class RewardsGallery {
  constructor({ modal, grid, emptyState, dismissSelectors = [], triggers = [] } = {}) {
    this.modal = modal;
    this.grid = grid;
    this.emptyState = emptyState;
    this.rewards = [];
    this.triggers = new Set();
    this.dismissElements = [];
    this.previouslyFocused = null;

    this.handleTrigger = this.open.bind(this);
    this.handleDismiss = this.close.bind(this);
    this.handleKeydown = this.onKeydown.bind(this);

    if (modal && dismissSelectors.length) {
      dismissSelectors.forEach((selector) => {
        modal
          .querySelectorAll(selector)
          .forEach((el) => this.registerDismissElement(el));
      });
    }

    triggers.forEach((trigger) => this.registerTrigger(trigger));
  }

  registerTrigger(trigger) {
    if (!trigger || this.triggers.has(trigger)) return;
    this.triggers.add(trigger);
    trigger.addEventListener('click', this.handleTrigger);
  }

  unregisterTrigger(trigger) {
    if (!trigger || !this.triggers.has(trigger)) return;
    trigger.removeEventListener('click', this.handleTrigger);
    this.triggers.delete(trigger);
  }

  registerDismissElement(el) {
    if (!el) return;
    el.addEventListener('click', this.handleDismiss);
    this.dismissElements.push(el);
  }

  open(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || !this.modal.hasAttribute('hidden')) {
      return;
    }

    this.previouslyFocused = document.activeElement;
    this.modal.removeAttribute('hidden');
    document.addEventListener('keydown', this.handleKeydown);
    const title = this.modal.querySelector('#reward-gallery-title');
    if (title) {
      title.focus();
    }
  }

  close(event) {
    if (event) {
      event.preventDefault();
    }
    if (!this.modal || this.modal.hasAttribute('hidden')) {
      return;
    }
    this.modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', this.handleKeydown);
    if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
      this.previouslyFocused.focus();
    }
    this.previouslyFocused = null;
  }

  onKeydown(event) {
    if (event.key === 'Escape') {
      this.close(event);
    }
  }

  setRewards(rewards) {
    this.rewards = Array.isArray(rewards) ? rewards : [];
    this.render();
  }

  render() {
    if (!this.grid || !this.emptyState) return;
    this.grid.innerHTML = '';

    if (!this.rewards.length) {
      this.emptyState.removeAttribute('hidden');
      return;
    }

    this.emptyState.setAttribute('hidden', '');

    this.rewards.forEach((reward) => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      card.dataset.rewardId = reward.id || '';
      card.dataset.rewardImage = reward.image || '';
      card.dataset.rewardLabel = reward.label || reward.name || 'Reward';
      card.dataset.rewardMessage = reward.message || '';
      card.dataset.rewardDate = reward.date || '';

      const thumb = document.createElement('div');
      thumb.className = 'gallery-card__thumb';
      if (reward.image) {
        const img = document.createElement('img');
        img.src = reward.image;
        img.alt = reward.label || reward.name || 'Daily reward';
        thumb.appendChild(img);
      } else {
        thumb.classList.add('gallery-card__thumb--empty');
        thumb.textContent = reward.emoji || '✨';
      }
      card.appendChild(thumb);

      if (reward.unlockedAt || reward.date) {
        const date = document.createElement('p');
        date.className = 'gallery-card__date';
        const dateValue = reward.unlockedAt || reward.date;
        const parsed = new Date(dateValue);
        date.textContent = dateFormatter.format(parsed);
        card.appendChild(date);
      }

      if (reward.message) {
        const message = document.createElement('p');
        message.className = 'gallery-card__message';
        message.textContent = reward.message;
        card.appendChild(message);
      }

      this.grid.appendChild(card);
    });
  }

  refreshTriggers() {
    this.triggers.forEach((trigger) => {
      if (!document.contains(trigger)) {
        this.unregisterTrigger(trigger);
      }
    });
  }

  destroy() {
    this.triggers.forEach((trigger) =>
      trigger.removeEventListener('click', this.handleTrigger)
    );
    this.dismissElements.forEach((el) =>
      el.removeEventListener('click', this.handleDismiss)
    );
    document.removeEventListener('keydown', this.handleKeydown);
    this.triggers.clear();
    this.dismissElements = [];
  }
}

export const initRewardsGallery = () => {
  const modal = document.querySelector('[data-reward-gallery-modal]');
  if (!modal) return null;

  const grid = modal.querySelector('[data-gallery-grid]');
  const emptyState = modal.querySelector('[data-gallery-empty]');
  const dismissSelectors = ['[data-gallery-dismiss]'];

  return new RewardsGallery({
    modal,
    grid,
    emptyState,
    dismissSelectors
  });
};

export default initRewardsGallery;
