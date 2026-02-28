/**
 * Bayan - Khatma Engine & Reader
 * Consolidated Version: Corrected RTL Swiping, Multi-Khatma, Streak Protection, 
 * Bookmark Fix, Juz' Logic, and Transcribed Surah Names.
 */



class BayanKhatma {
    constructor() {
        this.state = {
            journey: null,
            freePage: 1,
            streak: 0,
            lastStreakDate: null,
            freezes: 0,
            lang: localStorage.getItem('Bayan_lang') || 'ar'
        };

        // Comprehensive Juz' start pages for dynamic lookup
        this.juzPages = [
            1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 202, 222, 242, 262, 282,
            302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582
        ];

        this.currentViewMode = 'wird';
        this.init();
    }

    async init() {
        console.log('[Khatma] init() starting; current state:', this.state);

        // 1. Load Journey Cache
        const localData = localStorage.getItem('Bayan_khatma_cache');
        if (localData) {
            this.state.journey = JSON.parse(localData);
            console.log('[Khatma] loaded journey from localStorage', this.state.journey);
            const savedMode = this.state.journey.mode;
            if (savedMode === 'free' || savedMode === 'wird') {
                this.currentViewMode = savedMode;
            }
        }

        // 2. Load Free Mode Progress
        const savedFree = localStorage.getItem('Bayan_free_page');
        if (savedFree) {
            this.state.freePage = parseInt(savedFree);
            console.log('[Khatma] loaded freePage from localStorage', this.state.freePage);
        }

        // 3. Load Streak & Freeze Protection
        const savedStreak = localStorage.getItem('Bayan_streak_data');
        if (savedStreak) {
            const data = JSON.parse(savedStreak);
            this.state.streak = data.streak || 0;
            if (data.lastDate) {
                const parsed = new Date(data.lastDate);
                if (!isNaN(parsed)) this.state.lastStreakDate = parsed.toISOString().slice(0, 10);
                else this.state.lastStreakDate = null;
            } else {
                this.state.lastStreakDate = null;
            }
            this.state.freezes = data.freezes || 0;
            this.checkStreakValidity();
        }

        // 4. Supabase Synchronization
        try {
            if (window.getSupabaseClient) await window.getSupabaseClient();
            const sb = window.HadithEngine?.sb || window.sb;
            if (sb) {
                const { data: { user } } = await sb.auth.getUser();
                if (user) {
                    const server = await this.loadServerProgress();
                    if (!server && this.state.journey) {
                        this.persistProgress();
                    }
                } else {
                    sb.auth.onAuthStateChange(async (event, session) => {
                        if (event === 'SIGNED_IN' && session?.user) {
                            const server = await this.loadServerProgress();
                            this.updateUI();
                            if (!server && this.state.journey) {
                                this.persistProgress();
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('[Khatma] init supabase error', e);
        }

        this.updateUI();

        try { setTimeout(() => this.setMode(this.currentViewMode), 10); } catch (e) { }

        // Action routing (e.g., from deep links)
        try {
            const params = new URLSearchParams(window.location.search);
            const surahParam = params.get('surah');

            // Check if URL has a Surah number
            if (surahParam) {
                const surahNum = parseInt(surahParam);
                if (!isNaN(surahNum) && surahNum >= 1 && surahNum <= 114) {
                    this.setMode('free'); // Switch to general reading mode
                    await Reader.fetchSurahs(); // Ensure Surah list is loaded
                    const targetSurah = Reader.surahs.find(s => s.id === surahNum);

                    if (targetSurah) {
                        this.state.freePage = targetSurah.page;
                        Reader.open();
                    }
                }
            } else if (params.get('action') === 'resume' && this.state.journey) {
                Reader.open();
            }
        } catch (e) {
            console.error('[Khatma] URL Routing Error:', e);
        }
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
                this.state.lastStreakDate = fakeLastDate.toISOString().slice(0, 10);
                alert(`تم استخدام ${this.toArabic(daysToCover)} من جمدات الحماس للحفاظ على تتابعك! ❄️`);
            } else {
                this.state.streak = 0;
                this.state.freezes = 0;
            }
            this.saveStreak();
        }
    }

    incrementStreak() {
        const todayIso = new Date().toISOString().slice(0, 10);
        if (this.state.lastStreakDate !== todayIso) {
            this.state.streak++;
            this.state.lastStreakDate = todayIso;
            if (this.state.streak % 7 === 0) {
                this.state.freezes++;
                alert("أحسنت! حصلت على 'جمدة حماس' مكافأة لالتزامك لمدة أسبوع! ❄️");
            }
            this.saveStreak();
        }
    }

    saveStreak() {
        localStorage.setItem('Bayan_streak_data', JSON.stringify({
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
            localStorage.setItem('Bayan_free_page', this.state.freePage);
        } else {
            if (!this.state.journey) return;
            this.state.journey.current_page = normalizedPage;
            this.save();
        }
        this.updateUI();
    }

    save() {
        localStorage.setItem('Bayan_khatma_cache', JSON.stringify(this.state.journey));
        this.persistProgress();
    }

    async loadServerProgress() {
        try {
            const sb = window.HadithEngine?.sb || window.sb;
            if (!sb) return null;

            const { data: { user } } = await sb.auth.getUser();
            if (!user) return null;

            const { data, error } = await sb
                .from('khatma_progress')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .maybeSingle();

            if (error || !data) return null;

            let page = 1;
            if (data.last_verse_key && data.last_verse_key.startsWith('page:')) {
                const p = parseInt(data.last_verse_key.split(':')[1]);
                if (!isNaN(p)) page = p;
            } else if (data.last_page) {
                const p = parseInt(data.last_page);
                if (!isNaN(p)) page = p;
            }

            this.state.journey = {
                id: 'srv_' + Date.now(),
                current_page: page,
                start_date: data.start_date || new Date().toISOString(),
                end_date: data.end_date || data.start_date || new Date().toISOString(),
                mode: 'wird'
            };
            localStorage.setItem('Bayan_khatma_cache', JSON.stringify(this.state.journey));
            this.updateUI();
            return data;
        } catch (e) {
            return null;
        }
    }

    async persistProgress() {
        try {
            const sb = window.HadithEngine?.sb || window.sb;
            if (!sb) return;

            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;

            const lastPage = this.state.journey ? this.state.journey.current_page : this.state.freePage;
            const startDate = this.state.journey?.start_date || new Date().toISOString();
            const endDate = this.state.journey?.end_date || startDate;

            const payload = {
                user_id: user.id,
                is_active: true,
                last_verse_key: `page:${lastPage}`,
                last_page: lastPage,
                start_date: startDate,
                end_date: endDate,
                updated_at: new Date().toISOString()
            };
            await sb.from('khatma_progress').upsert(payload, { onConflict: 'user_id' });
        } catch (e) { }
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

    getJuzByPage(p) {
        for (let i = this.juzPages.length - 1; i >= 0; i--) {
            if (p >= this.juzPages[i]) return i + 1;
        }
        return 1;
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
            if (modeTitle) modeTitle.innerText = "قراءة حرة";
            if (modeStatus) modeStatus.innerText = "تصفح المصحف دون قيود";
            if (targetPageDisp) targetPageDisp.innerText = this.toArabic(604);
            if (currentPageDisp) currentPageDisp.innerText = this.toArabic(this.state.freePage);
        } else {
            let target = Math.min(604, j.current_page + dailyGoal - 1);
            if (modeTitle) modeTitle.innerText = "ورد اليوم";
            if (modeStatus) modeStatus.innerText = `المطلوب ${this.toArabic(dailyGoal)} صفحات اليوم`;
            if (targetPageDisp) targetPageDisp.innerText = this.toArabic(target);
            if (currentPageDisp) currentPageDisp.innerText = this.toArabic(j.current_page);
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
    activeMode: 'wird',
    surahs: [],

    toArabic(n) { return engine.toArabic(n); },

    async fetchSurahs() {
        if (this.surahs.length > 0) return;
        try {
            // Using language=en to get transcribed names (Al-Baqarah)
            const res = await fetch('https://api.quran.com/api/v4/chapters?language=en');
            const data = await res.json();
            this.surahs = data.chapters.map(s => ({
                id: s.id,
                nameAr: s.name_arabic,
                nameTr: s.name_simple, // Transcribed name
                page: s.pages[0]
            }));
        } catch (e) { console.error('Surah fetch failed', e); }
    },

    async open() {
        await this.fetchSurahs();
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

        document.getElementById('readerModal')?.classList.remove('hidden');
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

        const pageInput = document.getElementById('gotoPageInput');
        if (pageInput) pageInput.value = this.currentPage;

        // --- UPDATED SECTION START ---
        // Sync Search Placeholder with Arabic Surah & Juz
        const currentSurah = [...this.surahs].reverse().find(s => s.page <= this.currentPage);
        const searchInput = document.getElementById('surahSearchInput');

        if (searchInput && currentSurah) {
            const juzNum = engine.getJuzByPage(this.currentPage);
            const juzAr = this.toArabic(juzNum);
            // Result: "سورة البقرة (الجزء ٢)"
            searchInput.placeholder = `${currentSurah.nameAr} (الجزء ${juzAr})`;
        }
        // --- UPDATED SECTION END ---

        this.updateBookmarkPosition(rNum, lNum);
    },

    showSurahList(show) {
        const list = document.getElementById('surahDropdownList');
        if (!list) return;
        if (show) {
            list.classList.remove('hidden');
            this.filterSurahDropdown();
        } else {
            setTimeout(() => list.classList.add('hidden'), 250);
        }
    },

    filterSurahDropdown() {
        const input = document.getElementById('surahSearchInput');
        const list = document.getElementById('surahDropdownList');
        if (!input || !list) return;

        const query = input.value.toLowerCase();

        // Handle Juz searches
        if (query.startsWith('j') || query.startsWith('ج')) {
            const juzNum = parseInt(query.replace(/\D/g, ''));
            if (juzNum >= 1 && juzNum <= 30) {
                const page = engine.juzPages[juzNum - 1];
                list.innerHTML = `
                    <div onclick="Reader.selectSurah(${page})" 
                         class="p-4 bg-teal-600/20 text-white cursor-pointer border-b border-white/10">
                        Jump to Juz ${juzNum} (Page ${this.toArabic(page)})
                    </div>`;
                return;
            }
        }

        const filtered = this.surahs.filter(s =>
            s.nameAr.includes(query) || s.nameTr.toLowerCase().includes(query)
        );

        list.innerHTML = filtered.map(s => `
            <div onclick="Reader.selectSurah(${s.page})" 
                 class="p-3 border-b border-white/5 hover:bg-teal-600/30 cursor-pointer flex justify-between items-center transition-colors">
                <div class="flex flex-col">
                    <span class="text-sm font-bold">${s.nameAr}</span>
                    <span class="text-[10px] text-teal-200">${s.nameTr}</span>
                </div>
                <span class="opacity-50 text-[10px]">ص ${this.toArabic(s.page)}</span>
            </div>
        `).join('');
    },

    selectSurah(page) {
        this.currentPage = page;
        this.render();
        this.showSurahList(false);
        const input = document.getElementById('surahSearchInput');
        if (input) input.value = "";
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
        document.getElementById('readerModal')?.classList.add('hidden');
        engine.updateUI();
    },

    jumpToPage() {
        const el = document.getElementById('gotoPageInput');
        if (!el) return;
        const val = parseInt(el.value);
        if (val >= 1 && val <= 604) {
            this.currentPage = val;
            this.render();
        }
    }
};

const engine = new BayanKhatma();

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

            if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                // RTL Corrected Swiping: Swipe Left (diffX > 0) -> Next Page (+1)
                Reader.changePage(diffX > 0 ? -1 : 1);
            }
        }, { passive: true });
    }

    document.getElementById('prevPageBtn')?.addEventListener('click', () => Reader.changePage(-1));
    document.getElementById('nextPageBtn')?.addEventListener('click', () => Reader.changePage(1));

    // Search input listener for transcribed filtering
    const searchInput = document.getElementById('surahSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => Reader.filterSurahDropdown());
        searchInput.addEventListener('focus', () => Reader.showSurahList(true));
        searchInput.addEventListener('blur', () => Reader.showSurahList(false));
    }
});
function jumpToSurah(surahId) {
    if (!window.allSurahs) {
        console.warn("[Khatma] Surah data not ready yet.");
        return;
    }

    const surah = window.allSurahs.find(s => s.id == surahId);
    if (surah) {
        // chapters in API v4 usually have 'pages' array [start, end]
        const targetPage = surah.pages ? surah.pages[0] : 1;
        console.log(`[Khatma] Navigating to Surah ${surah.name_arabic} (Page ${targetPage})`);

        // Update your global page state
        currentPage = targetPage;

        // Trigger your render functions
        if (typeof renderReaderPage === 'function') renderReaderPage();
        if (typeof syncReaderHeader === 'function') syncReaderHeader(currentPage);
    } else {
        console.error("[Khatma] Surah ID not found:", surahId);
    }
}
async function initSurahData() {
    try {
        const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
        if (!res.ok) throw new Error("Network response was not ok");

        const data = await res.json();
        window.allSurahs = data.chapters; // Store globally for index modal access

        console.log("[Khatma] Surah data loaded successfully");

        // After data is ready, check if we need to jump to a specific surah from URL
        const urlParams = new URLSearchParams(window.location.search);
        const surahParam = urlParams.get('surah');
        if (surahParam) {
            jumpToSurah(surahParam);
        }
    } catch (e) {
        console.error("[Khatma] Data load error:", e);
    }
}
async function startApp() {
    initSurahData();
    setTimeout(() => { if (window.checkActiveKhatma) window.checkActiveKhatma(); }, 1500);
}

window.onload = startApp;
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-random')?.addEventListener('click', () => setMode('random'));
    document.getElementById('btn-daily')?.addEventListener('click', () => setMode('daily'));
    document.getElementById('surahSearch')?.addEventListener('input', filterSurahs);
});