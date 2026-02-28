/**
 * WirdEngine - Full Standalone Daily Habit Track
 * Restrictions: Locked to X pages, persistent tracking, swipe & keyboard support.
 */
const WirdEngine = {
    startPage: 1,
    fixedDailyGoal: 5,
    targetPage: 1,
    isCompleted: false,

    init() {
        // 1. Fetch Global Progress (Where we left off yesterday)
        const globalStart = localStorage.getItem('yatlo_wird_global_start');
        this.startPage = globalStart ? parseInt(globalStart) : 1;

        // 2. Fetch Session Progress (If they refreshed mid-wird)
        const sessionCurrent = localStorage.getItem('yatlo_wird_session_current');

        // 3. Set strict boundaries for today
        this.targetPage = Math.min(604, this.startPage + this.fixedDailyGoal - 1);

        // 4. Determine starting page
        Reader.currentPage = sessionCurrent ? parseInt(sessionCurrent) : this.startPage;

        // 5. Apply Locks & Handlers
        this.applyStrictNavigation();
        this.initSwipes();
        this.initKeyboard();

        // 6. Initial Render & UI Sync
        Reader.render();
        this.updateUI();
    },

    /**
     * Hijacks the global Reader navigation to enforce the X-page limit
     */
    applyStrictNavigation() {
        const self = this;

        Reader.changeSpread = function (dir) {
            // Determine step: 1 page for mobile, 2 for desktop spread
            const isMobile = window.innerWidth <= 768;
            const step = isMobile ? 1 : 2;

            let next = Reader.currentPage + (dir * step);

            // BOUNDARY LOCKS: Prevent going outside today's assigned pages
            if (next < self.startPage) next = self.startPage;
            if (next > self.targetPage) next = self.targetPage;

            if (next !== Reader.currentPage) {
                Reader.currentPage = next;
                Reader.render();
                self.updateUI();
            }
        };
    },

    /**
     * Updates progress bar, text, and saves current position
     */
    updateUI() {
        const progressBar = document.getElementById('wirdProgressBar');
        const statusEl = document.getElementById('wirdStatusText');
        const successOverlay = document.getElementById('wirdSuccess');

        if (!progressBar || !statusEl) return;

        // Calculate progress within the fixed goal
        const pagesReadInSession = (Reader.currentPage - this.startPage) + 1;
        const progressPercent = (pagesReadInSession / this.fixedDailyGoal) * 100;

        progressBar.style.width = `${Math.min(100, progressPercent)}%`;

        // Save current page to session storage (bookmark for today)
        localStorage.setItem('yatlo_wird_session_current', Reader.currentPage);

        // Update Remaining Text
        const remaining = this.targetPage - Reader.currentPage;

        if (remaining <= 0) {
            statusEl.innerText = "اكتمل الورد!";
            if (successOverlay) successOverlay.classList.remove('hidden');

            if (!this.isCompleted) {
                this.handleCompletion();
                this.isCompleted = true;
            }
        } else {
            statusEl.innerText = `بقي ${Reader.toArabic(remaining)} صفحات لإنهاء ورد اليوم`;
            if (successOverlay) successOverlay.classList.add('hidden');
        }
    },

    /**
     * Saves progress globally so tomorrow starts where today ended
     */
    handleCompletion() {
        const nextDayStart = Math.min(604, this.targetPage + 1);
        localStorage.setItem('yatlo_wird_global_start', nextDayStart);
        // We keep session_current so they stay on the last page if they stay on the site
    },

    /**
     * Mobile Touch/Swipe Support
     */
    initSwipes() {
        let touchStartX = 0;
        const threshold = 50;
        const container = document.body;

        container.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const deltaX = touchStartX - touchEndX;

            if (Math.abs(deltaX) > threshold) {
                if (deltaX > 0) Reader.changeSpread(-1);  // Swipe Left -> Next
                else Reader.changeSpread(1);            // Swipe Right -> Prev
            }
        }, { passive: true });
    },

    /**
     * Desktop Keyboard Support
     */
    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key === 'ArrowRight') Reader.changeSpread(-1); // Previous (RTL)
            if (e.key === 'ArrowLeft') Reader.changeSpread(1);   // Next
        });
    },

    /**
     * Helper for developers/testing
     */
    resetForTesting() {
        localStorage.removeItem('yatlo_wird_global_start');
        localStorage.removeItem('yatlo_wird_session_current');
        window.location.reload();
    }
};

// --- Execution ---
document.addEventListener('DOMContentLoaded', () => {
    // Delay slightly to ensure Reader object from khatma.js is ready
    setTimeout(() => {
        if (document.getElementById('wirdProgressBar') || window.location.pathname.includes('wird')) {
            WirdEngine.init();
        }
    }, 150);
});