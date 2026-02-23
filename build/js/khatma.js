/**
 * Yatlo - Khatma Engine & Reader
 * Consolidated Version: Corrected RTL Swiping, Multi-Khatma, Streak Protection, 
 * Bookmark Fix, and Mobile-Optimized Gestures.
 */

class YatloKhatma {
    constructor() {
        this.state = {
            journey: null,
            freePage: 1,
            streak: 0,
            lastStreakDate: null,
            freezes: 0
        };
        this.currentViewMode = 'khatma';
        this.init();
    }

    init() {
        const localData = localStorage.getItem('yatlo_khatma_cache');
        if (localData) this.state.journey = JSON.parse(localData);

        const savedFree = localStorage.getItem('yatlo_free_page');
        if (savedFree) this.state.freePage = parseInt(savedFree);

        const savedStreak = localStorage.getItem('yatlo_streak_data');
        if (savedStreak) {
            const data = JSON.parse(savedStreak);
            this.state.streak = data.streak || 0;
            this.state.lastStreakDate = data.lastDate || null;
            this.state.freezes = data.freezes || 0;
            this.checkStreakValidity();
        }
        this.updateUI();
    }

    checkStreakValidity() {
        if (!this.state.lastStreakDate) return;
        const lastDate = new Date(this.state.lastStreakDate);
        const today = new Date();
        lastDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 1) {
            const daysToCover = diffDays - 1;
            if (this.state.freezes >= daysToCover) {
                this.state.freezes -= daysToCover;
                const fakeLastDate = new Date();
                fakeLastDate.setDate(today.getDate() - 1);
                this.state.lastStreakDate = fakeLastDate.toDateString();
                alert(`تم استخدام ${this.toArabic(daysToCover)} من جمدات الحماس للحفاظ على تتابعك! ❄️`);
            } else {
                this.state.streak = 0;
                this.state.freezes = 0;
            }
            this.saveStreak();
        }
    }

    incrementStreak() {
        const today = new Date().toDateString();
        if (this.state.lastStreakDate !== today) {
            this.state.streak++;
            this.state.lastStreakDate = today;
            if (this.state.streak % 7 === 0) {
                this.state.freezes++;
                alert("أحسنت! حصلت على 'جمدة حماس' مكافأة لالتزامك لمدة أسبوع! ❄️");
            }
            this.saveStreak();
        }
    }

    saveStreak() {
        localStorage.setItem('yatlo_streak_data', JSON.stringify({
            streak: this.state.streak,
            lastDate: this.state.lastStreakDate,
            freezes: this.state.freezes
        }));
    }

    createNewJourney(mode = 'custom') {
        const startPage = parseInt(document.getElementById('startPage').value) || 1;
        const khatmaCount = parseInt(document.getElementById('khatmaCount')?.value) || 1;
        let journey = {
            id: 'j_' + Date.now(),
            mode: mode,
            current_page: Math.min(604, Math.max(1, startPage)),
            start_date: new Date().toISOString(),
            khatma_count: khatmaCount
        };
        if (mode === 'custom') {
            const days = parseInt(document.getElementById('daysInput').value) || 30;
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);
            journey.end_date = endDate.toISOString();
        } else {
            journey.fixed_pages = 5;
        }
        this.state.journey = journey;
        this.save();
        this.updateUI();
    }

    updateProgress(pageNum, isFreeMode = false) {
        let normalizedPage = Math.min(604, Math.max(1, pageNum));
        if (isFreeMode) {
            this.state.freePage = normalizedPage;
            localStorage.setItem('yatlo_free_page', this.state.freePage);
        } else {
            if (!this.state.journey) return;
            this.state.journey.current_page = normalizedPage;
            this.save();
        }
        this.updateUI();
    }

    save() {
        localStorage.setItem('yatlo_khatma_cache', JSON.stringify(this.state.journey));
    }

    resetJourney() {
        if (confirm("هل أنت متأكد من إعادة ضبط الختمة؟ سيتم مسح كل التقدم الحالي.")) {
            localStorage.clear();
            this.state.journey = null;
            window.location.reload();
        }
    }

    getDailyGoal() {
        if (!this.state.journey) return 0;
        const j = this.state.journey;
        if (j.mode === 'custom') {
            const daysLeft = Math.max(1, Math.ceil((new Date(j.end_date) - new Date()) / 86400000));
            const rem = 604 - j.current_page + 1;
            return Math.ceil(rem / daysLeft);
        }
        return j.fixed_pages || 5;
    }

    setMode(mode) {
        document.querySelectorAll('[id^="tab-"]').forEach(btn => {
            btn.className = "flex-1 py-2 rounded-xl text-sm transition-all text-gray-400";
        });
        const activeTab = document.getElementById(`tab-${mode}`);
        if (activeTab) activeTab.className = "flex-1 py-2 rounded-xl text-sm transition-all bg-teal-600 text-white shadow-lg";
        this.currentViewMode = mode;
        this.updateUI();
    }

    toArabic(n) { return n.toString().replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]); }

    updateUI() {
        const setup = document.getElementById('setupSection');
        const dash = document.getElementById('dashboardSection');
        if (!this.state.journey) {
            setup?.classList.remove('hidden');
            dash?.classList.add('hidden');
            return;
        }
        setup?.classList.add('hidden');
        dash?.classList.remove('hidden');

        const streakCountEl = document.getElementById('streakCount');
        if (streakCountEl) streakCountEl.innerText = this.toArabic(this.state.streak);
        const freezeCountEl = document.getElementById('freezeCount');
        if (freezeCountEl) {
            freezeCountEl.innerText = this.toArabic(this.state.freezes);
            freezeCountEl.parentElement.style.opacity = this.state.freezes > 0 ? "1" : "0.3";
        }

        const j = this.state.journey;
        const mode = this.currentViewMode;
        const dailyGoal = this.getDailyGoal();
        const modeTitle = document.getElementById('modeTitle');
        const modeStatus = document.getElementById('modeStatus');
        const targetPageDisp = document.getElementById('targetPageDisp');
        const currentPageDisp = document.getElementById('currentPageDisp');

        if (mode === 'free') {
            modeTitle.innerText = "قراءة حرة";
            modeStatus.innerText = "تصفح المصحف دون قيود";
            targetPageDisp.innerText = this.toArabic(604);
            currentPageDisp.innerText = this.toArabic(this.state.freePage);
        } else if (mode === 'wird') {
            let target = Math.min(604, j.current_page + dailyGoal - 1);
            modeTitle.innerText = "ورد اليوم";
            modeStatus.innerText = `المطلوب ${this.toArabic(dailyGoal)} صفحات اليوم`;
            targetPageDisp.innerText = this.toArabic(target);
            currentPageDisp.innerText = this.toArabic(j.current_page);
        } else {
            modeTitle.innerText = "رحلة الختمة";
            modeStatus.innerText = `بمعدل ${this.toArabic(dailyGoal)} صفحات يومياً`;
            targetPageDisp.innerText = this.toArabic(604);
            currentPageDisp.innerText = this.toArabic(j.current_page);
        }

        const progress = (((mode === 'free' ? this.state.freePage : j.current_page) - 1) / 603) * 100;
        const percentEl = document.getElementById('percentText');
        if (percentEl) percentEl.innerText = `${this.toArabic(Math.floor(progress))}%`;
        const circle = document.getElementById('progressCircle');
        if (circle) {
            const circ = 364.4;
            circle.style.strokeDashoffset = circ - (progress / 100 * circ);
        }
    }
}

/** * READER LOGIC 
 */
const Reader = {
    currentPage: 1,
    targetPage: 604,
    activeMode: 'khatma',

    toArabic(n) { return engine.toArabic(n); },

    open() {
        this.activeMode = engine.currentViewMode;
        const j = engine.state.journey;
        this.currentPage = (this.activeMode === 'free') ? engine.state.freePage : j.current_page;

        if (this.activeMode === 'wird') {
            let target = j.current_page + engine.getDailyGoal() - 1;
            this.targetPage = Math.min(604, target);
        } else {
            this.targetPage = 604;
        }

        const indicator = document.getElementById('readerModeIndicator');
        if (indicator) indicator.innerText = this.activeMode === 'wird' ? `إلى صفحة ${this.toArabic(this.targetPage)}` : "المصحف";
        document.getElementById('readerModal').classList.remove('hidden');
        this.render();
    },

    render() {
        const isMobile = window.innerWidth <= 768;
        let rNum = this.currentPage;
        let lNum = rNum + 1;
        if (!isMobile) {
            rNum = (this.currentPage % 2 === 0) ? this.currentPage - 1 : this.currentPage;
            lNum = rNum + 1;
        }
        const load = (num, id) => {
            const img = document.getElementById(id);
            if (!img) return;
            if (num > 604 || num < 1) {
                img.parentElement.classList.add('hidden');
                return;
            }
            img.parentElement.classList.remove('hidden');
            img.classList.remove('loaded');
            img.src = `https://quran.ksu.edu.sa/png_big/${num}.png`;
            img.onload = () => img.classList.add('loaded');
        };
        load(rNum, 'imgRight');
        if (!isMobile) load(lNum, 'imgLeft');
        document.getElementById('gotoPageInput').value = this.currentPage;
        this.updateBookmarkPosition(rNum, lNum);
    },

    goToBookmark() {
        const savedPage = (this.activeMode === 'free') ? engine.state.freePage : engine.state.journey.current_page;
        if (this.currentPage !== savedPage) {
            this.currentPage = savedPage;
            this.render();
        }
    },

    changePage(dir) {
        const isMobile = window.innerWidth <= 768;
        const step = isMobile ? 1 : 2;

        if (this.activeMode === 'wird' && dir > 0) {
            if (this.currentPage >= this.targetPage) {
                this.showCompletion();
                return;
            }
        }

        let nextVal = this.currentPage + (dir * step);
        if (nextVal > 604 || nextVal < 1) return;

        this.currentPage = nextVal;
        this.render();
    },

    saveBookmark(side) {
        let pageToSave = this.currentPage;
        if (window.innerWidth > 768) {
            const isEven = (this.currentPage % 2 === 0);
            const rNum = isEven ? this.currentPage - 1 : this.currentPage;
            pageToSave = (side === 'left') ? rNum + 1 : rNum;
        }
        engine.updateProgress(pageToSave, (this.activeMode === 'free'));
        this.render();
    },

    updateBookmarkPosition(rNum, lNum) {
        const bookmark = document.getElementById('physicalBookmark');
        if (!bookmark) return;
        const currentSaved = this.activeMode === 'free' ? engine.state.freePage : engine.state.journey.current_page;
        bookmark.className = "";
        if (currentSaved === rNum || (window.innerWidth > 768 && currentSaved === lNum)) {
            bookmark.classList.add('bookmark-active');
        } else if (currentSaved > Math.max(rNum, lNum)) {
            bookmark.classList.add('bookmark-ahead');
        } else {
            bookmark.classList.add('bookmark-behind');
        }
    },

    showCompletion() {
        engine.incrementStreak();
        engine.updateProgress(this.targetPage, false);
        if (confirm("أحسنت! لقد أتممت وردك اليومي. هل تود العودة؟")) {
            this.close();
        }
    },

    close() {
        const isFree = (this.activeMode === 'free');
        const currentSaved = isFree ? engine.state.freePage : engine.state.journey.current_page;
        if (this.currentPage !== currentSaved) {
            if (confirm(`هل قرأت إلى صفحة ${this.toArabic(this.currentPage)}؟ سيتم حفظ تقدمك.`)) {
                engine.updateProgress(this.currentPage, isFree);
            }
        }
        document.getElementById('readerModal').classList.add('hidden');
        engine.updateUI();
    },

    jumpToPage() {
        const val = parseInt(document.getElementById('gotoPageInput').value);
        if (val >= 1 && val <= 604) {
            this.currentPage = val;
            this.render();
        }
    }
};

const engine = new YatloKhatma();

// Event Listeners with Swiping Logic
document.addEventListener('DOMContentLoaded', () => {
    let touchStartX = 0;
    let touchStartY = 0;
    const modal = document.getElementById('readerModal');

    if (modal) {
        modal.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        modal.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;

            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            // Threshold: 50px movement AND horizontal movement must be greater than vertical
            if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                // RTL Corrected Swiping:
                // Swipe Left finger (diffX > 0) -> Move Forward (+1)
                // Swipe Right finger (diffX < 0) -> Move Backward (-1)
                Reader.changePage(diffX > 0 ? -1 : 1);
            }
        }, { passive: true });
    }
});