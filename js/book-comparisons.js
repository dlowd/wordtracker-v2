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
  if (eligible.length <= 3) {
    return eligible;
  }
  return eligible.slice(-3);
};

export const getNextTargetBook = (books, totalWords) => {
  if (!Array.isArray(books) || !Number.isFinite(totalWords)) return null;
  return books.find((book) => totalWords < book.words) || null;
};

export class BookComparisonsController {
  constructor({ root, listEl, nextTargetEl, emptyStateEl } = {}) {
    this.root = root;
    this.listEl = listEl;
    this.nextTargetEl = nextTargetEl;
    this.emptyStateEl = emptyStateEl;
    this.books = [];
  }

  setBooks(books) {
    this.books = Array.isArray(books) ? books : [];
  }

  update({ totalWords }) {
    if (!this.root) return;
    if (!this.books.length || !Number.isFinite(totalWords)) {
      this.root.setAttribute('hidden', '');
      return;
    }

    const passed = getPassedBooks(this.books, totalWords);
    const nextTarget = getNextTargetBook(this.books, totalWords);

    if (!passed.length) {
      this.root.removeAttribute('hidden');
      if (this.listEl) this.listEl.innerHTML = '';
      if (this.nextTargetEl) {
        this.nextTargetEl.setAttribute('hidden', '');
      }
      if (this.emptyStateEl) {
        this.emptyStateEl.removeAttribute('hidden');
      }
      return;
    }

    this.root.removeAttribute('hidden');

    if (this.listEl) {
      this.listEl.innerHTML = '';
      passed.forEach((book) => {
        const item = document.createElement('li');
        item.className = 'book-comparison__item';
        item.innerHTML = `
          <div class="book-comparison__title">${book.title}</div>
          <div class="book-comparison__meta">${book.author || 'Unknown'} · ${book.words.toLocaleString()} words</div>
        `;
        this.listEl.appendChild(item);
      });
    }

    if (this.nextTargetEl) {
      if (nextTarget) {
        this.nextTargetEl.removeAttribute('hidden');
        this.nextTargetEl.innerHTML = `
          Keep going! Next up: <strong>${nextTarget.title}</strong> at ${nextTarget.words.toLocaleString()} words.
        `;
      } else {
        this.nextTargetEl.setAttribute('hidden', '');
      }
    }

    if (this.emptyStateEl) {
      this.emptyStateEl.setAttribute('hidden', '');
    }
  }

  destroy() {
    if (this.root) {
      this.root.setAttribute('hidden', '');
    }
    if (this.listEl) {
      this.listEl.innerHTML = '';
    }
  }
}

export const initBookComparisons = () => {
  const root = document.querySelector('[data-book-comparisons]');
  if (!root) return null;

  const listEl = root.querySelector('[data-book-comparisons-list]');
  const nextTargetEl = root.querySelector('[data-book-comparisons-next]');
  const emptyStateEl = root.querySelector('[data-book-comparisons-empty]');

  return new BookComparisonsController({ root, listEl, nextTargetEl, emptyStateEl });
};

export default initBookComparisons;
