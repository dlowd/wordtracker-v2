const BOOKS_ENDPOINT = 'data/books.json';

let cachedBooks = null;
let loadPromise = null;

const fallbackBooks = () => [
  { title: 'The Metamorphosis', author: 'Franz Kafka', words: 22000 },
  { title: 'The Old Man and the Sea', author: 'Ernest Hemingway', words: 27000 },
  { title: 'A Christmas Carol', author: 'Charles Dickens', words: 29000 },
  { title: 'Of Mice and Men', author: 'John Steinbeck', words: 30000 },
  { title: 'Animal Farm', author: 'George Orwell', words: 30000 },
  { title: "The Hitchhiker's Guide to the Galaxy", author: 'Douglas Adams', words: 46000 },
  { title: 'Fahrenheit 451', author: 'Ray Bradbury', words: 46000 },
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', words: 47000 },
  { title: 'Lord of the Flies', author: 'William Golding', words: 59000 },
  { title: 'The Catcher in the Rye', author: 'J. D. Salinger', words: 73000 },
  { title: 'Harry Potter and the Philosopher\'s Stone', author: 'J. K. Rowling', words: 77000 },
  { title: '1984', author: 'George Orwell', words: 88000 },
  { title: 'The Hobbit', author: 'J. R. R. Tolkien', words: 95000 },
  { title: 'The Fellowship of the Ring', author: 'J. R. R. Tolkien', words: 187000 }
];

export const loadBooks = async () => {
  if (cachedBooks) return cachedBooks;
  if (loadPromise) return loadPromise;

  loadPromise = fetch(BOOKS_ENDPOINT)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load books.json: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid book data');
      cachedBooks = data
        .map((book) => ({
          title: book.title,
          author: book.author,
          words: Number(book.words)
        }))
        .filter((book) => book.title && Number.isFinite(book.words))
        .sort((a, b) => a.words - b.words);
      return cachedBooks;
    })
    .catch((error) => {
      console.warn('Using fallback book data', error);
      cachedBooks = fallbackBooks();
      return cachedBooks;
    });

  return loadPromise;
};

export const getPassedBooks = (books, totalWords) => {
  if (!Array.isArray(books) || !Number.isFinite(totalWords)) return [];
  const eligible = books.filter((book) => totalWords >= book.words);
  return eligible;
};

export const getNextTargetBook = (books, totalWords) => {
  if (!Array.isArray(books) || !Number.isFinite(totalWords)) return null;
  return books.find((book) => totalWords < book.words) || null;
};

export class BookComparisonsController {
  constructor({
    root,
    headerEl,
    listEl,
    summaryEl,
    nextTargetEl,
    emptyStateEl,
    moreTrigger,
    modal,
    modalListEl,
    modalEmptyEl,
    modalDismissEls,
    modalNextTargetEl
  } = {}) {
    this.root = root;
    this.headerEl = headerEl;
    this.listEl = listEl;
    this.summaryEl = summaryEl;
    this.nextTargetEl = nextTargetEl;
    this.emptyStateEl = emptyStateEl;
    this.moreTrigger = moreTrigger;
    this.modal = modal;
    this.modalListEl = modalListEl;
    this.modalEmptyEl = modalEmptyEl;
    this.modalNextTargetEl = modalNextTargetEl;
    this.modalDismissEls = Array.isArray(modalDismissEls) ? modalDismissEls : [];
    this.books = [];
    this.passedBooks = [];
    this.previousFocus = null;
    this.compactMode = false;
    this.lastTotalWords = Number.NaN;
    this.hasRenderedOnce = false;
    this.emptyMessage = (this.emptyStateEl?.textContent || 'Keep writing to unlock literary milestones.').trim();
    this.currentNextTarget = null;

    this.handleMoreClick = () => this.openModal();
    this.handleDismissClick = () => this.closeModal();
    this.handleDocumentKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModal();
      }
    };

    if (this.moreTrigger) {
      this.moreTrigger.addEventListener('click', this.handleMoreClick);
    }
    this.modalDismissEls.forEach((el) => el.addEventListener('click', this.handleDismissClick));
  }

  setBooks(books) {
    this.books = Array.isArray(books) ? books : [];
  }

  setCompactMode(enabled) {
    this.compactMode = Boolean(enabled);

    if (this.root) {
      this.root.classList.toggle('book-comparisons--compact', this.compactMode);
    }
    if (this.headerEl) {
      if (this.compactMode) {
        this.headerEl.setAttribute('hidden', '');
      } else {
        this.headerEl.removeAttribute('hidden');
      }
    }
    if (!this.compactMode && this.moreTrigger && this.headerEl) {
      this.moreTrigger.classList.remove('book-comparisons__more--inline');
      this.headerEl.appendChild(this.moreTrigger);
    }
    if (!this.compactMode) {
      this.hideSummary();
    }

    this.updateInlineNextTarget(this.currentNextTarget);

    if (this.hasRenderedOnce && Number.isFinite(this.lastTotalWords)) {
      this.update({ totalWords: this.lastTotalWords });
    } else if (this.compactMode) {
      this.showSummaryMessage(this.emptyMessage, false);
      this.hideEmptyState();
      this.setListVisibility(false);
    }
  }

  update({ totalWords }) {
    if (!this.root) return;

    const normalizedTotal = Number(totalWords);
    const hasData = this.books.length > 0 && Number.isFinite(normalizedTotal);
    this.lastTotalWords = normalizedTotal;
    this.hasRenderedOnce = hasData;

    if (!hasData) {
      this.resetForNoData();
      return;
    }

    const passed = getPassedBooks(this.books, normalizedTotal);
    const nextTarget = getNextTargetBook(this.books, normalizedTotal);
    const latestPassed = passed.length ? passed[passed.length - 1] : null;

    this.root.removeAttribute('hidden');
    this.passedBooks = passed;
    this.toggleMoreTrigger(passed.length > 1);
    this.currentNextTarget = nextTarget;
    this.updateInlineNextTarget(nextTarget);
    this.updateModal(passed, nextTarget);

    if (!latestPassed) {
      this.renderNoComparisons();
      return;
    }

    this.renderComparisons({ latest: latestPassed, passed });
  }

  resetForNoData() {
    if (this.root) {
      this.root.setAttribute('hidden', '');
    }
    this.passedBooks = [];
    this.toggleMoreTrigger(false);
    this.updateModal([], null);
    this.hideSummary();
    this.setListVisibility(false);
    this.clearList();
    this.hideEmptyState();
    this.currentNextTarget = null;
    this.updateInlineNextTarget(null);
  }

  renderNoComparisons() {
    if (this.compactMode) {
      this.setListVisibility(false);
      this.clearList();
      this.showSummaryMessage(this.emptyMessage, false);
      this.hideEmptyState();
    } else {
      this.hideSummary();
      this.setListVisibility(false);
      this.clearList();
      this.showEmptyState();
    }
  }

  renderComparisons({ latest, passed }) {
    if (this.compactMode) {
      this.renderCompactComparison(latest, passed);
    } else {
      this.renderStandardComparison(latest);
    }
  }

  renderStandardComparison(book) {
    this.hideSummary();
    this.hideEmptyState();
    this.setListVisibility(true);
    if (!this.listEl) return;

    this.listEl.innerHTML = '';
    const item = document.createElement('li');
    item.className = 'book-comparison__item';
    item.innerHTML = `
      <div class="book-comparison__title">${book.title}</div>
      <div class="book-comparison__meta">${book.author || 'Unknown'} · ${book.words.toLocaleString()} words</div>
    `;
    this.listEl.appendChild(item);
  }

  renderCompactComparison(book, passed) {
    this.hideEmptyState();
    this.setListVisibility(false);
    this.clearList();
    const showMore = passed.length > 1;
    this.showSummaryMessage((container) => {
      container.append('Your book is now longer than ');
      const titleEl = document.createElement('strong');
      titleEl.textContent = book.title;
      container.append(titleEl);
      if (book.author) {
        container.append(` by ${book.author}`);
      }
      container.append('!');
    }, showMore);
  }

  showSummaryMessage(content, includeMore) {
    if (!this.summaryEl) return;
    this.summaryEl.textContent = '';

    if (typeof content === 'function') {
      content(this.summaryEl);
    } else if (typeof content === 'string') {
      this.summaryEl.textContent = content;
    } else {
      this.summaryEl.textContent = '';
    }

    this.summaryEl.removeAttribute('hidden');

    if (includeMore && this.moreTrigger) {
      this.moreTrigger.classList.add('book-comparisons__more--inline');
      this.summaryEl.append(' [');
      this.summaryEl.append(this.moreTrigger);
      this.summaryEl.append(']');
    } else if (this.moreTrigger) {
      this.moreTrigger.classList.remove('book-comparisons__more--inline');
    }
  }

  hideSummary() {
    if (!this.summaryEl) return;
    this.summaryEl.textContent = '';
    this.summaryEl.setAttribute('hidden', '');
    if (this.moreTrigger && this.headerEl && !this.compactMode) {
      this.headerEl.appendChild(this.moreTrigger);
      this.moreTrigger.classList.remove('book-comparisons__more--inline');
    }
  }

  showEmptyState() {
    if (this.emptyStateEl) {
      this.emptyStateEl.removeAttribute('hidden');
    }
  }

  hideEmptyState() {
    if (this.emptyStateEl) {
      this.emptyStateEl.setAttribute('hidden', '');
    }
  }

  clearList() {
    if (this.listEl) {
      this.listEl.innerHTML = '';
    }
  }

  setListVisibility(visible) {
    if (!this.listEl) return;
    if (visible) {
      this.listEl.removeAttribute('hidden');
    } else {
      this.listEl.setAttribute('hidden', '');
    }
  }

  updateInlineNextTarget(nextTarget) {
    if (!this.nextTargetEl) return;
    if (this.compactMode || !nextTarget) {
      this.nextTargetEl.setAttribute('hidden', '');
      this.nextTargetEl.textContent = '';
      return;
    }
    this.nextTargetEl.removeAttribute('hidden');
    this.nextTargetEl.innerHTML = `
      Keep going! Next up: <strong>${nextTarget.title}</strong> by ${nextTarget.author} at ${nextTarget.words.toLocaleString()} words.
    `;
  }

  updateModal(passedBooks, nextTarget) {
    if (!this.modalListEl || !this.modalEmptyEl) {
      return;
    }

    this.modalListEl.innerHTML = '';
    if (!passedBooks.length) {
      this.modalEmptyEl.removeAttribute('hidden');
    } else {
      this.modalEmptyEl.setAttribute('hidden', '');
      passedBooks.forEach((book) => {
        const item = document.createElement('li');
        item.className = 'book-comparison-modal__item';
        item.innerHTML = `
          <div class="book-comparison-modal__title">${book.title}</div>
          <div class="book-comparison-modal__meta">${book.author || 'Unknown'} · ${book.words.toLocaleString()} words</div>
        `;
        this.modalListEl.appendChild(item);
      });
    }

    if (this.modalNextTargetEl) {
      if (nextTarget) {
        this.modalNextTargetEl.removeAttribute('hidden');
        this.modalNextTargetEl.innerHTML = `
          Keep going! Next up: <strong>${nextTarget.title}</strong> by ${nextTarget.author} at ${nextTarget.words.toLocaleString()} words.
        `;
      } else if (passedBooks.length) {
        this.modalNextTargetEl.removeAttribute('hidden');
        this.modalNextTargetEl.textContent = 'You have surpassed every book in our list!';
      } else {
        this.modalNextTargetEl.setAttribute('hidden', '');
        this.modalNextTargetEl.textContent = '';
      }
    }
  }

  destroy() {
    this.closeModal();
    if (this.root) {
      this.root.setAttribute('hidden', '');
      this.root.classList.remove('book-comparisons--compact');
    }
    this.compactMode = false;
    if (this.headerEl) {
      this.headerEl.removeAttribute('hidden');
    }
    this.hideSummary();
    this.setListVisibility(false);
    this.clearList();
    this.hideEmptyState();
    this.currentNextTarget = null;
    this.updateInlineNextTarget(null);
    this.toggleMoreTrigger(false);
    this.passedBooks = [];
    this.hasRenderedOnce = false;
    this.lastTotalWords = Number.NaN;

    if (this.modalListEl) {
      this.modalListEl.innerHTML = '';
    }
    if (this.modalEmptyEl) {
      this.modalEmptyEl.removeAttribute('hidden');
    }
    if (this.modalNextTargetEl) {
      this.modalNextTargetEl.setAttribute('hidden', '');
      this.modalNextTargetEl.textContent = '';
    }
    if (this.moreTrigger) {
      this.moreTrigger.removeEventListener('click', this.handleMoreClick);
    }
    this.modalDismissEls.forEach((el) => el.removeEventListener('click', this.handleDismissClick));
    this.modalDismissEls = [];
  }

  toggleMoreTrigger(visible) {
    if (!this.moreTrigger) return;
    if (visible) {
      this.moreTrigger.removeAttribute('hidden');
    } else {
      this.moreTrigger.setAttribute('hidden', '');
    }
  }

  openModal() {
    if (!this.modal || this.modal.hasAttribute('hidden') === false) return;
    if (!this.passedBooks.length) return;

    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modal.removeAttribute('hidden');
    const title = this.modal.querySelector('#book-comparisons-modal-title');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus();
      title.addEventListener(
        'blur',
        () => {
          title.removeAttribute('tabindex');
        },
        { once: true }
      );
    }
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  closeModal() {
    if (!this.modal) return;

    const wasOpen = !this.modal.hasAttribute('hidden');
    this.modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', this.handleDocumentKeydown);

    if (!wasOpen) {
      this.previousFocus = null;
      return;
    }

    const closeButtons = this.modalDismissEls.filter((el) => el.matches?.('[data-book-comparisons-close]'));
    closeButtons.forEach((btn) => btn.blur());

    if (this.previousFocus) {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }
}

export const initBookComparisons = () => {
  const root = document.querySelector('[data-book-comparisons]');
  if (!root) return null;

  const headerEl = root.querySelector('[data-book-comparisons-header]') ?? root.querySelector('.book-comparisons__header');
  const listEl = root.querySelector('[data-book-comparisons-list]');
  const summaryEl = root.querySelector('[data-book-comparisons-summary]');
  const nextTargetEl = root.querySelector('[data-book-comparisons-next]');
  const emptyStateEl = root.querySelector('[data-book-comparisons-empty]');
  const moreTrigger = root.querySelector('[data-book-comparisons-more]');
  const modal = document.querySelector('[data-book-comparisons-modal]');
  const modalListEl = modal?.querySelector('[data-book-comparisons-modal-list]') ?? null;
  const modalEmptyEl = modal?.querySelector('[data-book-comparisons-modal-empty]') ?? null;
  const modalNextTargetEl = modal?.querySelector('[data-book-comparisons-modal-next]') ?? null;
  const modalDismissEls = modal
    ? Array.from(modal.querySelectorAll('[data-book-comparisons-dismiss]'))
    : [];

  return new BookComparisonsController({
    root,
    headerEl,
    listEl,
    summaryEl,
    nextTargetEl,
    emptyStateEl,
    moreTrigger,
    modal,
    modalListEl,
    modalEmptyEl,
    modalDismissEls,
    modalNextTargetEl
  });
};

export default initBookComparisons;
