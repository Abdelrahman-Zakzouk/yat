/**
 * YatloKhatma - Journey Engine
 * Manages the state, progress, and calculations for the Khatma.
 */


class YatloKhatma {
    constructor() {
        this.state = { journey: null };
        this.init();
    }

    init() {
        const localData = localStorage.getItem('yatlo_khatma_cache');
        if (localData) {
            try {
                this.state.journey = JSON.parse(localData);
            } catch (e) {
                console.error("Corrupt cache, resetting.");
                this.state.journey = null;
            }
        }
        this.updateUI();
    }

    async createNewJourney() {
        const daysInput = document.getElementById('daysInput');
        const startInput = document.getElementById('startPage');

        const days = parseInt(daysInput.value);
        const startPage = parseInt(startInput.value) || 1;

        if (!days || days < 1) return alert("يرجى تحديد مدة الختمة بشكل صحيح");

        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        this.state.journey = {
            id: 'j_' + Date.now(),
            current_page: Math.min(604, Math.max(1, startPage)),
            end_date: endDate.toISOString(),
            last_progress_at: new Date().toISOString()
        };

        this.save();
        this.updateUI();
    }

    async updateProgress(pageNum) {
        if (!this.state.journey) return;
        this.state.journey.current_page = Math.min(604, Math.max(1, pageNum));
        this.state.journey.last_progress_at = new Date().toISOString();
        this.save();
        this.updateUI();
        Reader.syncBookmarkVisuals();
    }

    save() {
        localStorage.setItem('yatlo_khatma_cache', JSON.stringify(this.state.journey));
    }

    resetJourney() {
        if (confirm("إعادة ضبط الختمة؟ سيتم حذف جميع التقدم الحالي.")) {
            localStorage.removeItem('yatlo_khatma_cache');
            this.state.journey = null;
            this.updateUI();
        }
    }

    updateUI() {
        const setup = document.getElementById('setupSection');
        const dash = document.getElementById('dashboardSection');

        if (!this.state.journey) {
            if (setup) setup.classList.remove('hidden');
            if (dash) dash.classList.add('hidden');
            return;
        }

        if (setup) setup.classList.add('hidden');
        if (dash) dash.classList.remove('hidden');

        const { current_page, end_date } = this.state.journey;

        // Calculation Logic
        const daysLeft = Math.max(1, Math.ceil((new Date(end_date) - new Date()) / 86400000));
        const pagesRem = Math.max(0, 604 - current_page + 1);
        const dailyGoal = Math.ceil(pagesRem / daysLeft);

        // Update Text Elements
        const updateText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = Reader.toArabic(val);
        };

        updateText('pagesPerDay', dailyGoal);
        updateText('pagesPerSalah', Math.ceil(dailyGoal / 5));
        updateText('currentPageDisp', current_page);
        updateText('daysLeftDisp', daysLeft);

        // Circular Progress logic
        const progress = ((current_page - 1) / 603) * 100; // 603 because page 1 is 0%
        const percentEl = document.getElementById('percentText');
        if (percentEl) percentEl.innerText = `${Reader.toArabic(Math.floor(progress))}%`;

        const circle = document.getElementById('progressCircle');
        if (circle) {
            // Formula: Circumference - (percentage * Circumference / 100)
            const circumference = 364.4;
            circle.style.strokeDashoffset = circumference - (progress / 100 * circumference);
        }
    }
}

/**
 * Reader - The Quran Image Viewer
 * Designed for the clean, joined-page Mushaf layout.
 */
const Reader = {
    currentPage: 1,
    isRendering: false,

    toArabic(n) {
        if (n === null || n === undefined) return '';
        return n.toString().replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
    },

    open() {
        const modal = document.getElementById('readerModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Start reader at the user's current progress
        this.currentPage = engine.state.journey ? engine.state.journey.current_page : 1;
        this.render();
    },

    close() {
        const modal = document.getElementById('readerModal');
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    },

    async loadPage(num, imgId, lblId) {
        const imgEl = document.getElementById(imgId);
        const numEl = document.getElementById(lblId);

        // Update the page number label in Arabic
        if (numEl) numEl.innerText = this.toArabic(num);
        if (!imgEl) return;

        // 1. Reset for fade-in effect
        imgEl.classList.remove('loaded');

        /**
         * RELIABLE SOURCE: Al-Quran Cloud / Islamic Network
         * Pattern: https://cdn.islamic.network/quran/images/{page_number}.png
         * These are standard high-quality Madani scans (604 pages).
         */
        const fullUrl = `https://quran.ksu.edu.sa/png_big/${num}.png`;        // 2. Preload to prevent the "white flash" or empty boxes
        const tempImg = new Image();
        tempImg.src = fullUrl;

        tempImg.onload = () => {
            imgEl.src = fullUrl;
            imgEl.classList.add('loaded'); // Triggers the CSS opacity transition
        };

        tempImg.onerror = () => {
            console.error(`Failed to load page ${num}. Trying backup...`);
            // Fallback: This is a secondary CDN that uses the same numbering
            imgEl.src = `https://glcdn.quran.com/images/mushaf/p${num}.png`;
            imgEl.classList.add('loaded');
        };
    },

    syncBookmarkVisuals() {
        const bm = document.getElementById("physicalBookmark");
        if (!bm || !engine.state.journey) return;

        const saved = engine.state.journey.current_page;
        const current = this.currentPage;
        const isMobile = window.innerWidth <= 768;

        bm.classList.remove("bookmark-active", "bookmark-behind", "bookmark-ahead");

        // Bookmark is active if it's on any page currently visible
        const onCurrentSpread = (saved === current || (!isMobile && saved === current + 1));

        if (onCurrentSpread) {
            bm.classList.add("bookmark-active");
        } else if (saved > current) {
            bm.classList.add("bookmark-ahead");
        } else {
            bm.classList.add("bookmark-behind");
        }
    },

    goToBookmark() {
        if (!engine.state.journey) return;
        this.currentPage = engine.state.journey.current_page;
        this.render();
    },

    async saveBookmarkHere(side) {
        // If 'left' side clicked, save progress as the second page of the spread
        const page = (side === 'right') ? this.currentPage : this.currentPage + 1;
        await engine.updateProgress(page);

        // Visual haptic feedback
        const sideId = (side === 'right') ? 'pageRight' : 'pageLeft';
        const el = document.getElementById(sideId);
        if (el) {
            el.style.backgroundColor = "rgba(45, 212, 191, 0.05)";
            setTimeout(() => el.style.backgroundColor = "", 300);
        }
    },

    changeSpread(dir) {
        if (this.isRendering) return;

        // NEW: Check if mobile (single page view)
        const isMobile = window.innerWidth <= 768;

        // On mobile we move 1 page at a time. On desktop we move 2 (a spread).
        const step = isMobile ? 1 : 2;

        // Note: 'dir' is -1 for Right (Previous) and 1 for Left (Next)
        // In Arabic Mushaf, Next page is a lower number if reading RTL, 
        // but your changeSpread(1) currently increases the number.
        let next = this.currentPage + (dir * step);

        // Bounds checking
        if (next >= 1 && next <= 604) {
            this.currentPage = next;
            this.render();
        }
    },

    async render() {
        if (this.isRendering) return;
        this.isRendering = true;

        const isMobile = window.innerWidth <= 768;

        let rNum, lNum;

        if (isMobile) {
            // Mobile: Just show the current page on the "Right" slot
            rNum = this.currentPage;
            lNum = null;
        } else {
            // Desktop: Align to odd/even spread
            rNum = (this.currentPage % 2 === 0) ? this.currentPage - 1 : this.currentPage;
            lNum = rNum + 1;
        }

        // Load the visible pages
        const tasks = [this.loadPage(rNum, 'imgRight', 'numRight')];
        if (!isMobile && lNum <= 604) {
            tasks.push(this.loadPage(lNum, 'imgLeft', 'numLeft'));
        }

        await Promise.all(tasks);

        this.syncBookmarkVisuals();
        this.isRendering = false;
    },

    syncBookmarkVisuals() {
        const bm = document.getElementById("physicalBookmark");
        if (!bm || !engine.state.journey) return;

        const saved = engine.state.journey.current_page;
        const current = this.currentPage;
        const isMobile = window.innerWidth <= 768;

        bm.classList.remove("bookmark-active", "bookmark-behind", "bookmark-ahead");

        // Mobile logic: Is the saved page exactly what we are looking at?
        // Desktop logic: Is the saved page part of the 2-page spread?
        const onCurrentSpread = isMobile
            ? (saved === current)
            : (saved === current || saved === current + 1);

        if (onCurrentSpread) {
            bm.classList.add("bookmark-active");
        } else if (saved > current) {
            bm.classList.add("bookmark-ahead");
        } else {
            bm.classList.add("bookmark-behind");
        }
    },

    jumpToPage() {
        const input = document.getElementById('gotoPageInput');
        let page = parseInt(input.value);

        if (isNaN(page) || page < 1 || page > 604) {
            alert("يرجى إدخال رقم صفحة بين ١ و ٦٠٤");
            return;
        }

        // Align to the correct spread (Page 1 is right, so even page should lead to page-1)
        this.currentPage = (page % 2 === 0) ? page - 1 : page;
        this.render();
        input.value = ""; // Clear input
    },

    // Add keyboard listener for 'Enter' on the input
    setupEventListeners() {
        const input = document.getElementById('gotoPageInput');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.jumpToPage();
            });
        }
    }
};

// Inline script to handle the 'Enter' key and jump logic specifically
// if not already fully implemented in khatma.js
Reader.jumpToPage = function () {
    const input = document.getElementById('gotoPageInput');
    let val = parseInt(input.value);
    if (val >= 1 && val <= 604) {
        // Adjust to the start of the spread (Page 1 is on the right/odd)
        this.currentPage = (val % 2 === 0) ? val - 1 : val;
        this.render();
        input.value = "";
        input.blur();
    } else {
        showToast("يرجى إدخال صفحة بين ١ و ٦٠٤");
    }

    // --- Swipe Engine ---
    // --- Enhanced Swipe Engine ---
    let touchStartX = 0;
    let touchStartY = 0; // Track Y to prevent accidental turns while scrolling

    const initSwipe = () => {
        const book = document.getElementById('bookContainer');
        if (!book) return;

        book.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
            touchStartY = e.changedTouches[0].clientY;
        }, { passive: true });

        book.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const deltaX = touchStartX - touchEndX;
            const deltaY = Math.abs(touchStartY - touchEndY);

            // Logic: 
            // 1. Must move at least 50px horizontally
            // 2. Horizontal move must be greater than vertical (prevents accidental turns)
            if (Math.abs(deltaX) > 50 && deltaY < 100) {
                if (deltaX > 0) {
                    // Swiped Left -> Next Page
                    Reader.changeSpread(1);
                } else {
                    // Swiped Right -> Previous Page
                    Reader.changeSpread(-1);
                }
            }
        }, { passive: true });
    };

    // Run this after the DOM loads
    document.addEventListener('DOMContentLoaded', initSwipe);
    // Also call it when the Reader opens just in case
    const oldOpen = Reader.open;
    Reader.open = function () {
        oldOpen.apply(this);
        initSwipe();
    };

};

// 1. Move the Swipe Engine to the GLOBAL scope (outside Reader)
let touchStartX = 0;
let touchStartY = 0;

const initSwipe = () => {
    // Attach to window so it captures swipes even if the 'bookContainer' has transparency
    window.addEventListener('touchstart', (e) => {
        // Only trigger if the reader modal is actually open
        if (document.getElementById('readerModal').classList.contains('hidden')) return;

        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        if (document.getElementById('readerModal').classList.contains('hidden')) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const deltaX = touchStartX - touchEndX;
        const deltaY = Math.abs(touchStartY - touchEndY);

        // Increased sensitivity: 40px move
        if (Math.abs(deltaX) > 40 && deltaY < 100) {
            if (deltaX > 0) {
                Reader.changeSpread(-1); // Swipe Left -> Next
            } else {
                Reader.changeSpread(1); // Swipe Right -> Prev
            }
        }
    }, { passive: true });
};

// 2. Initialize it immediately
document.addEventListener('DOMContentLoaded', () => {
    initSwipe();
});

// 3. Keep your jumpToPage clean
Reader.jumpToPage = function () {
    const input = document.getElementById('gotoPageInput');
    let val = parseInt(input.value);
    if (val >= 1 && val <= 604) {
        this.currentPage = (val % 2 === 0) ? val - 1 : val;
        this.render();
        input.value = "";
        input.blur();
    }
};



// Global instance initialization
const engine = new YatloKhatma();