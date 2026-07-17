// ========== SERVICE WORKER REGISTRATION :// ==========
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('✓ Service Worker registered successfully');
            updateStatus('Service Worker ready for offline access');
        })
        .catch(err => {
            console.error('✗ Service Worker registration failed:', err);
            updateStatus('Offline mode may not be available');
        });
}

// ========== INSTALL BUTTON FOR PWA ==========
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.classList.add('show');
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            installBtn.classList.remove('show');
        }
    });
}

window.addEventListener('appinstalled', () => {
    console.log('✓ App installed');
    deferredPrompt = null;
});

// ========== ONLINE/OFFLINE STATUS INDICATOR ==========
function updateStatusIndicator() {
    const indicator = document.getElementById('statusIndicator');
    if (!indicator) return;
    
    if (navigator.onLine) {
        indicator.style.display = 'none';
    } else {
        indicator.style.display = 'block';
        indicator.className = 'offline-indicator';
        indicator.textContent = '🔌 You are offline - Using cached Bible data';
    }
}

window.addEventListener('online', updateStatusIndicator);
window.addEventListener('offline', updateStatusIndicator);
updateStatusIndicator();

// ========== BIBLE DATA AND STATE MANAGEMENT ==========
let bibleData = null;
let currentBook = "";
let currentChapter = "";

// Map to sidebar grid elements
const bookGrid = document.getElementById('book-grid');
const chapterGrid = document.getElementById('chapter-grid');
const content = document.getElementById('content');

// ========== LOAD BIBLE DATA ==========
async function loadBibleData() {
    try {
        updateStatus('Loading Bible data...');
        
        const response = await fetch('bible-kjv.json');
        if (!response.ok) throw new Error('Network response was not ok');
        
        // Fix: Clone the stream so both JSON parsing and Cache Storage can read it
        const responseClone = response.clone();
        bibleData = await response.json();
        console.log('✓ Bible data loaded from network');
        
        if ('caches' in window) {
            const cache = await caches.open('bible-v1');
            cache.put('bible-kjv.json', responseClone);
        }
    } catch (error) {
        console.warn('Network load failed, trying cache:', error);
        try {
            if ('caches' in window) {
                const cache = await caches.open('bible-v1');
                const cachedResponse = await cache.match('bible-kjv.json');
                if (cachedResponse) {
                    bibleData = await cachedResponse.json();
                    console.log('✓ Bible data loaded from cache');
                } else {
                    throw new Error('No cached Bible data');
                }
            }
        } catch (cacheError) {
            console.error('✗ Failed to load Bible data:', cacheError);
            content.innerHTML = '<div class="error">Failed to load Bible data. Please check your connection and refresh.</div>';
            updateStatus('Error: Could not load Bible data');
            return;
        }
    }

    populateBooks();
    updateStatus('Ready - Select a book to read');
}

// ========== POPULATE BOOK SELECTION SIDE PANEL ==========
function populateBooks() {
    if (!bibleData || !bookGrid) return;

    bookGrid.innerHTML = '';
    const books = Object.keys(bibleData);
    
    books.forEach(book => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn book-btn';
        btn.textContent = book;
        btn.title = book; // Tooltip for small screen text cutoff
        
        btn.addEventListener('click', () => {
            // Toggle highlight classes across the book choices
            document.querySelectorAll('.book-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentBook = book;
            updateChapterGrid();
        });
        
        bookGrid.appendChild(btn);
    });

    // Auto-select the first book (Genesis) on application launch
    if (bookGrid.firstChild) {
        bookGrid.firstChild.click();
    }
}

// ========== UPDATE CHAPTER LIST GRID IN SIDEBAR ==========
function updateChapterGrid() {
    if (!chapterGrid) return;
    
    chapterGrid.innerHTML = ''; 
    content.innerHTML = '<div class="loading">Select a chapter from the grid to read.</div>';

    if (currentBook && bibleData && bibleData[currentBook]) {
        const chapters = Object.keys(bibleData[currentBook]).map(Number).sort((a, b) => a - b);
        
        chapters.forEach(chapter => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn chap-btn';
            btn.textContent = chapter;
            
            btn.addEventListener('click', () => {
                // Toggle highlight classes across the chapter choices
                document.querySelectorAll('.chap-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                currentChapter = chapter.toString();
                displayChapter(currentBook, currentChapter);
            });
            
            chapterGrid.appendChild(btn);
        });

        // Automatically snap open Chapter 1 whenever switching books
        if (chapterGrid.firstChild) {
            chapterGrid.firstChild.click();
        }
    }
}

// ========== DISPLAY CHAPTER CONTENT TO MAIN READER COLUMN ==========
function displayChapter(book, chapter) {
    const chapterData = bibleData[book]?.[chapter];
    
    if (!chapterData) {
        content.innerHTML = '<div class="error">Chapter not found.</div>';
        return;
    }

    let html = `<div class="chapter-title">${book} ${chapter}</div><div class="verses">`;

    if (Array.isArray(chapterData)) {
        chapterData.forEach((verse, index) => {
            const verseNumber = index + 1;
            html += `
                <div class="verse">
                    <span class="verse-number">${verseNumber}</span>
                    <span class="verse-text">${escapeHtml(verse)}</span>
                </div>
            `;
        });
    } else if (typeof chapterData === 'object') {
        Object.entries(chapterData).forEach(([verseNum, text]) => {
            html += `
                <div class="verse">
                    <span class="verse-number">${verseNum}</span>
                    <span class="verse-text">${escapeHtml(text)}</span>
                </div>
            `;
        });
    }

    html += '</div>';
    content.innerHTML = html;
    
    // Smooth scroll the content pane back to top on chapter swap
    const mainViewport = document.getElementById('main-content');
    if (mainViewport) {
        mainViewport.scrollTo(0, 0);
    } else {
        window.scrollTo(0, 0);
    }
    
    updateStatus(`Displaying ${book} ${chapter}`);
}

// ========== UTILITY: ESCAPE HTML TO PREVENT XSS ==========
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== UPDATE STATUS MESSAGE ==========
function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = message;
}

// ========== INITIALIZE ON PAGE LOAD ==========
window.addEventListener('load', loadBibleData);

// ========== LOG WHEN OFFLINE/ONLINE ==========
window.addEventListener('online', () => console.log('✓ Back online'));
window.addEventListener('offline', () => console.log('⚠ Gone offline'));
