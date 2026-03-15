/**
 * Bayani - Khatma Engine & Reader
 * Consolidated Version: Corrected RTL Swiping, Multi-Khatma, Streak Protection, 
 * Bookmark Fix, Juz' Logic, Transcribed Surah Names, and Surah Audio Playback.
 */

class BayaniKhatma {
    constructor() {
        this.state = {
            journeys: [], // Multi-khatma array
            journey: null, // Currently active khatma
            freePage: 1,
            streak: 0,
            lastStreakDate: null,
            freezes: 0,
            lang: localStorage.getItem('Bayani_lang') || 'ar'
        };

        // Comprehensive Juz' start pages for dynamic lookup
        this.juzPages = [
            1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 202, 222, 242, 262, 282,
            302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582
        ];

        this.currentViewMode = 'wird';
        this.init();
    }

    toLocalISODate(value = new Date()) {
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    localDateToServerTimestamp(dateStr) {
        if (!dateStr) return new Date().toISOString();
        const [y, m, d] = String(dateStr).split('-').map(Number);
        if (!y || !m || !d) return new Date().toISOString();
        // Use local noon to avoid UTC day-shift around midnight/timezone boundaries.
        return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
    }

    async init() {
        console.log('[Khatma] init() starting; current state:', this.state);

        // 1. Load Journey Cache (Multi-Khatma Support)
        const localData = localStorage.getItem('Bayani_khatma_cache');
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                if (Array.isArray(parsed)) {
                    this.state.journeys = parsed;
                    // Default to the most recently created or active journey
                    this.state.journey = parsed[parsed.length - 1];
                } else {
                    this.state.journeys = [parsed];
                    this.state.journey = parsed;
                }
                console.log('[Khatma] loaded journey(s) from localStorage', this.state.journeys);

                const savedMode = this.state.journey?.mode;
                if (savedMode === 'free' || savedMode === 'wird') {
                    this.currentViewMode = savedMode;
                }
            } catch (e) {
                console.warn('[Khatma] Error parsing cache', e);
            }
        }

        // 2. Load Free Mode Progress
        const savedFree = localStorage.getItem('Bayani_free_page');
        if (savedFree) {
            this.state.freePage = parseInt(savedFree);
            console.log('[Khatma] loaded freePage from localStorage', this.state.freePage);
        }

        // 3. Load Streak & Freeze Protection
        const savedStreak = localStorage.getItem('Bayani_streak_data');
        if (savedStreak) {
            const data = JSON.parse(savedStreak);
            this.state.streak = data.streak || 0;
            if (data.lastDate) {
                const parsed = new Date(data.lastDate);
                if (!isNaN(parsed)) this.state.lastStreakDate = this.toLocalISODate(parsed);
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

        // Fix: Parse as local date components to avoid UTC shifts
        const [y, m, d] = this.state.lastStreakDate.split('-').map(Number);
        const lastDate = new Date(y, m - 1, d);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = today - lastDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 1) {
            const daysToCover = diffDays - 1;
            if (this.state.freezes >= daysToCover) {
                this.state.freezes -= daysToCover;
                const fakeLastDate = new Date();
                fakeLastDate.setDate(today.getDate() - 1);
                this.state.lastStreakDate = `${fakeLastDate.getFullYear()}-${String(fakeLastDate.getMonth() + 1).padStart(2, '0')}-${String(fakeLastDate.getDate()).padStart(2, '0')}`;
                alert(`تم استخدام ${this.toArabic(daysToCover)} من جمدات الحماس للحفاظ على تتابعك! ❄️`);
            } else {
                this.state.streak = 0;
            }
            this.saveStreak();
        }
    }

    incrementStreak() {
        // Fix: Use local date string
        const d = new Date();
        const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
        localStorage.setItem('Bayani_streak_data', JSON.stringify({
            streak: this.state.streak,
            lastDate: this.state.lastStreakDate,
            freezes: this.state.freezes
        }));
    }

    createNewJourney(mode = 'custom') {
        const startPage = parseInt(document.getElementById('startPage')?.value) || 1;
        const khatmaCount = parseInt(document.getElementById('khatmaCount')?.value) || 1;
        let journey = {
            id: 'j_' + Date.now(),
            mode: mode,
            current_page: Math.min(604, Math.max(1, startPage)),
            start_date: new Date().toISOString(),
            khatma_count: khatmaCount,
            target_khatmas: khatmaCount,
            khatmas_completed: 0
        };

        if (mode === 'custom') {
            const days = parseInt(document.getElementById('daysInput')?.value) || 30;
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);
            journey.end_date = endDate.toISOString();
        } else {
            journey.fixed_pages = 5;
        }

        // Multi-khatma support: Add to array and set as active
        this.state.journeys.push(journey);
        this.state.journey = journey;

        this.save();
        this.updateUI();
    }

    // Switch between active khatmas
    switchJourney(journeyId) {
        const target = this.state.journeys.find(j => j.id === journeyId);
        if (target) {
            this.state.journey = target;
            this.updateUI();
            this.persistProgress();
        }
    }

    updateProgress(pageNum, isFreeMode = false) {
        let normalizedPage = Math.min(604, Math.max(1, parseInt(pageNum) || 1));
        if (isFreeMode) {
            this.state.freePage = normalizedPage;
            localStorage.setItem('Bayani_free_page', this.state.freePage);
        } else {
            if (!this.state.journey) return;
            this.state.journey.current_page = normalizedPage;
            this.save();
        }
        this.updateUI();
    }

    save() {
        // Save the entire array of journeys
        const dataToSave = this.state.journeys.length > 0 ? this.state.journeys : this.state.journey;
        localStorage.setItem('Bayani_khatma_cache', JSON.stringify(dataToSave));
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

            const srvJourney = {
                id: 'srv_' + Date.now(),
                current_page: page,
                start_date: data.start_date || new Date().toISOString(),
                end_date: data.end_date || data.start_date || new Date().toISOString(),
                mode: 'wird',
                target_khatmas: data.target_khatmas || 1,
                khatmas_completed: data.khatmas_completed || 0
            };

            // Sync Streak & Freezes from Server
            const prevStreak = this.state.streak;
            const prevFreezes = this.state.freezes;
            const prevLastDate = this.state.lastStreakDate;

            if (data.streak !== undefined && data.streak !== null) this.state.streak = data.streak;
            if (data.freezes !== undefined && data.freezes !== null) this.state.freezes = data.freezes;
            if (data.last_progress_at) {
                const parsed = new Date(data.last_progress_at);
                if (!isNaN(parsed.getTime())) this.state.lastStreakDate = this.toLocalISODate(parsed);
            }
            this.checkStreakValidity(); // Validate date after loading from server

            // Merge server progress with local multi-khatma safely
            if (this.state.journeys.length === 0) {
                this.state.journeys.push(srvJourney);
            } else {
                this.state.journeys[this.state.journeys.length - 1] = srvJourney;
            }
            this.state.journey = this.state.journeys[this.state.journeys.length - 1];

            this.save();
            this.updateUI();

            // If validity check changed something (e.g. reset streak), sync back to server
            if (
                this.state.streak !== prevStreak
                || this.state.freezes !== prevFreezes
                || this.state.lastStreakDate !== prevLastDate
            ) {
                this.persistProgress();
            }

            return data;
        } catch (e) {
            return null;
        }
    }

    async persistProgress() {
        // FIX: Capture state synchronously to prevent race conditions
        // If we await getUser() before reading state, the UI might have already reset to page 1
        const journey = this.state.journey;
        const lastPage = journey ? journey.current_page : this.state.freePage;
        const startDate = journey?.start_date || new Date().toISOString();
        const endDate = journey?.end_date || startDate;
        const targetKhatmas = journey?.target_khatmas || 1;
        const khatmasCompleted = journey?.khatmas_completed || 0;
        const streak = this.state.streak;
        const freezes = this.state.freezes;
        const lastStreakDate = this.state.lastStreakDate;

        try {
            const sb = window.HadithEngine?.sb || window.sb;
            if (!sb) return;

            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;

            const payload = {
                user_id: user.id,
                is_active: true,
                current_page: lastPage,
                last_verse_key: `page:${lastPage}`,
                last_page: lastPage,
                start_date: startDate,
                end_date: endDate,
                updated_at: new Date().toISOString(),
                target_khatmas: targetKhatmas,
                khatmas_completed: khatmasCompleted,
                streak: streak,
                freezes: freezes,
                last_progress_at: this.localDateToServerTimestamp(lastStreakDate)
            };

            // IMPORTANT: user_id is not unique in current schema, so upsert(onConflict:user_id)
            // can fail. Update latest active row if exists, otherwise insert.
            const { data: existing } = await sb
                .from('khatma_progress')
                .select('id')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existing?.id) {
                await sb
                    .from('khatma_progress')
                    .update(payload)
                    .eq('id', existing.id);
            } else {
                await sb.from('khatma_progress').insert(payload);
            }
        } catch (e) { }
    }

    async deactivateServerProgress() {
        try {
            const sb = window.HadithEngine?.sb || window.sb;
            if (!sb) return;
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            await sb.from('khatma_progress')
                .update({ is_active: false })
                .eq('user_id', user.id)
                .eq('is_active', true);
        } catch (e) { console.error(e); }
    }

    resetJourney(resetAll = false) {
        const msg = resetAll
            ? "هل أنت متأكد من مسح جميع الختمات؟"
            : "هل أنت متأكد من إعادة ضبط الختمة الحالية فقط؟";

        if (confirm(msg)) {
            if (resetAll || !this.state.journeys || this.state.journeys.length <= 1) {
                localStorage.removeItem('Bayani_khatma_cache');
                this.state.journeys = [];
                this.state.journey = null;
            } else {
                // Remove only the active khatma and fallback to the previous one
                this.state.journeys = this.state.journeys.filter(j => j.id !== this.state.journey.id);
                this.state.journey = this.state.journeys[this.state.journeys.length - 1];
                this.save();
            }
            this.deactivateServerProgress();
            window.location.reload();
        }
    }

    getDailyGoal() {
        if (!this.state.journey) return 0;
        const j = this.state.journey;
        if (j.mode === 'custom' && j.end_date) {
            const start = new Date(j.start_date);
            const end = new Date(j.end_date);
            const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
            const target = j.target_khatmas || j.khatma_count || 1;
            const totalPages = 604 * target;
            return Math.ceil(totalPages / totalDays);
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
        const postPrayerGoal = Math.ceil(dailyGoal / 5); // Divide by 5 prayers per day

        const modeTitle = document.getElementById('modeTitle');
        const modeStatus = document.getElementById('modeStatus');
        const targetPageDisp = document.getElementById('targetPageDisp');
        const currentPageDisp = document.getElementById('currentPageDisp');
        const khatmaBadge = document.getElementById('khatmaProgressBadge');

        if (mode === 'free') {
            if (modeTitle) modeTitle.innerText = "قراءة حرة";
            if (modeStatus) modeStatus.innerText = "تصفح المصحف دون قيود";
            if (targetPageDisp) targetPageDisp.innerText = this.toArabic(604);
            if (currentPageDisp) currentPageDisp.innerText = this.toArabic(this.state.freePage);
            if (khatmaBadge) khatmaBadge.classList.add('hidden');
        } else {
            let target = Math.min(604, j.current_page + dailyGoal - 1);
            if (modeTitle) modeTitle.innerText = "ورد اليوم";

            if (khatmaBadge) {
                const currentKhatma = (j.khatmas_completed || 0) + 1;
                const totalKhatmas = j.target_khatmas || 1;
                if (totalKhatmas > 1 || currentKhatma > 1) {
                    khatmaBadge.innerText = `ختمة ${this.toArabic(currentKhatma)} من ${this.toArabic(totalKhatmas)}`;
                    khatmaBadge.classList.remove('hidden');
                } else {
                    khatmaBadge.classList.add('hidden');
                }
            }

            if (modeStatus) modeStatus.innerText = `المطلوب ${this.toArabic(dailyGoal)} صفحات اليوم | ${this.toArabic(postPrayerGoal)} بعد كل فرض`;
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

/** * READER LOGIC */
const Reader = {
    currentPage: 1,
    targetPage: 604,
    activeMode: 'wird',
    renderMode: localStorage.getItem('Bayani_reader_mode') || 'text', // 'text' | 'image'
    surahs: [],

    // --- Audio System Additions ---
    audioPlayer: new Audio(),
    isPlaying: false,
    currentAudioSurahId: null,
    audioState: 'stopped', // 'playing' | 'paused' | 'stopped'
    isLoaded: false,
    preloadedAudioUrl: null,
    preloadedSurahId: null,
    verseAudioQueue: [],
    verseAudioKeyQueue: [],
    verseAudioIndex: 0,
    currentPlayingVerseKey: null,
    hoverVerseKey: null,
    selectedVerseKey: null,
    chapterOnlyReciters: new Set([97]),
    selectedRecitationId: parseInt(localStorage.getItem('Bayani_khatma_reciter_id') || '97', 10) || 97,

    toArabic(n) { return engine.toArabic(n); },

    syncReciterSelects() {
        document.querySelectorAll('.js-reciter-select').forEach((el) => {
            el.value = String(this.selectedRecitationId);
        });
    },

    setRecitationId(reciterId) {
        const next = parseInt(reciterId, 10);
        if (!Number.isFinite(next) || next <= 0) return;
        if (next === this.selectedRecitationId) return;

        this.selectedRecitationId = next;
        localStorage.setItem('Bayani_khatma_reciter_id', String(next));
        this.syncReciterSelects();

        // Reset loaded audio so next play uses the new reciter
        this.stopAudio();

        const trackedPage = this.getTrackedPage();
        const currentSurah = [...this.surahs].reverse().find(s => s.page <= trackedPage);
        if (currentSurah) {
            this.currentAudioSurahId = currentSurah.id;
            this.preloadSurahAudio(currentSurah.id);
        }
    },

    async fetchSurahs() {
        // If a fetch is already in flight, wait for it instead of launching another
        if (this._surahsFetchPromise) return this._surahsFetchPromise;

        // Re-fetch if cache is empty OR missing the newer verses/type fields
        const needsRefetch = this.surahs.length === 0
            || !this.surahs[0].hasOwnProperty('verses')
            || !this.surahs[0].hasOwnProperty('nameAr')
            || !this.surahs[0].nameAr;
        if (!needsRefetch) return;

        this._surahsFetchPromise = (async () => {
            try {
                const res = await fetch('https://api.quran.com/api/v4/chapters?language=en');
                const data = await res.json();
                this.surahs = data.chapters.map(s => ({
                    id: s.id,
                    nameAr: s.name_arabic,
                    nameTr: s.name_simple,
                    page: s.pages[0],
                    verses: s.verses_count,
                    type: s.revelation_place
                }));
            } catch (e) { console.error('Surah fetch failed', e); }
            this._surahsFetchPromise = null;

            // Setup audio listeners once
            if (!this._audioListenersAdded) {
                this._audioListenersAdded = true;
                this.audioPlayer.addEventListener('ended', () => {
                    // Verse-by-verse continuous playback
                    if (Array.isArray(this.verseAudioQueue) && this.verseAudioIndex < this.verseAudioQueue.length - 1) {
                        this.verseAudioIndex += 1;
                        const nextUrl = this.verseAudioQueue[this.verseAudioIndex];
                        if (nextUrl) {
                            this.currentPlayingVerseKey = this.verseAudioKeyQueue[this.verseAudioIndex] || null;
                            this.updatePlayingVerseHighlight();
                            this.audioPlayer.src = nextUrl;
                            this.audioPlayer.play().catch((e) => console.error('[Audio] Next verse play failed', e));
                            return;
                        }
                    }

                    this.audioState = 'stopped';
                    this.isPlaying = false;
                    this.isLoaded = false;
                    this.verseAudioQueue = [];
                    this.verseAudioKeyQueue = [];
                    this.verseAudioIndex = 0;
                    this.currentPlayingVerseKey = null;
                    this.updatePlayingVerseHighlight();
                    this.updateAudioUI();
                });
            }
        })();
        return this._surahsFetchPromise;
    },

    async open() {
        await this.fetchSurahs();
        this.syncReciterSelects();
        this.activeMode = engine.currentViewMode;
        const j = engine.state.journey;

        // Fallback to free mode if journey is missing
        if (this.activeMode === 'wird' && !j) {
            this.activeMode = 'free';
        }

        this.currentPage = parseInt((this.activeMode === 'free') ? engine.state.freePage : (j?.current_page || 1)) || 1;

        if (this.activeMode === 'wird' && j) {
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

    _getVisibleSpreadPages(basePage = this.currentPage) {
        const isMobile = window.innerWidth <= 768;
        let rightPage = Math.min(604, Math.max(1, parseInt(basePage) || 1));
        let leftPage = rightPage + 1;

        if (!isMobile) {
            if (this.renderMode === 'image') {
                // Image mode: even page on right, odd on left (except the first page)
                if (rightPage !== 1) {
                    const evenPage = (rightPage % 2 === 0) ? rightPage : rightPage - 1;
                    rightPage = Math.max(1, evenPage);
                    leftPage = rightPage + 1;
                }
            } else {
                // Text mode: odd page on right, even on left
                const oddPage = (rightPage % 2 === 1) ? rightPage : rightPage - 1;
                rightPage = Math.max(1, oddPage);
                leftPage = rightPage + 1;
            }
        }

        if (leftPage > 604) leftPage = 0;
        return { rightPage, leftPage, isMobile };
    },

    getTrackedPage() {
        const { rightPage, leftPage, isMobile } = this._getVisibleSpreadPages(this.currentPage);
        if (isMobile || !leftPage) return rightPage;

        const savedPage = (this.activeMode === 'free')
            ? parseInt(engine.state.freePage || 1)
            : parseInt(engine.state.journey?.current_page || 1);

        // Site-wide rule: track the right page unless the bookmark is on the left page.
        return (savedPage === leftPage) ? leftPage : rightPage;
    },

    _setVerseHighlightClass(verseKey, className, on) {
        const key = String(verseKey || '').trim();
        if (!key) return;
        document.querySelectorAll(`.mq-w[data-vkey="${key}"], .mq-waqf[data-vkey="${key}"], .mq-end[data-vkey="${key}"]`).forEach(el => {
            el.classList.toggle(className, !!on);
        });
    },

    setHoverVerse(verseKey, on) {
        this.hoverVerseKey = on ? verseKey : null;
        this.updatePlayingVerseHighlight();
    },

    setSelectedVerse(verseKey) {
        this.selectedVerseKey = verseKey || null;
        this.updatePlayingVerseHighlight();
    },

    updatePlayingVerseHighlight() {
        document.querySelectorAll('.mq-w.playing-ayah, .mq-end.playing-ayah, .mq-waqf.playing-ayah, .mq-w.hover-ayah, .mq-end.hover-ayah, .mq-waqf.hover-ayah, .mq-w.selected-ayah, .mq-end.selected-ayah, .mq-waqf.selected-ayah')
            .forEach(el => {
                el.classList.remove('playing-ayah', 'hover-ayah', 'selected-ayah');
            });

        if (this.currentPlayingVerseKey) {
            this._setVerseHighlightClass(this.currentPlayingVerseKey, 'playing-ayah', true);
        }
        if (this.hoverVerseKey) {
            this._setVerseHighlightClass(this.hoverVerseKey, 'hover-ayah', true);
        }
        if (this.selectedVerseKey) {
            this._setVerseHighlightClass(this.selectedVerseKey, 'selected-ayah', true);
        }
    },

    render() {
        // Init styles/tooltip/sheet only for text mode
        if (this.renderMode === 'text') this._initOnce();

        const { rightPage: rNum, leftPage: lNum, isMobile } = this._getVisibleSpreadPages(this.currentPage);

        if (this.renderMode === 'image') {
            this._renderImagePages(rNum, lNum, isMobile);
        } else {
            this._renderTextPages(rNum, lNum, isMobile);
        }

        const trackedPage = this.getTrackedPage();

        const pageInput = document.getElementById('gotoPageInput');
        if (pageInput) pageInput.value = trackedPage;

        // Identify current Surah based on page
        const currentSurah = [...this.surahs].reverse().find(s => s.page <= trackedPage);

        const searchInputs = document.querySelectorAll('.surah-search-input');
        if (searchInputs.length && currentSurah) {
            const juzNum = engine.getJuzByPage(trackedPage);
            const juzAr = this.toArabic(juzNum);
            searchInputs.forEach(input => input.placeholder = `${currentSurah.nameAr} (الجزء ${juzAr})`);
        }

        // Silent audio sync — do not interrupt playback
        if (currentSurah && currentSurah.id !== this.currentAudioSurahId) {
            if (this.audioState === 'playing') return;
            if (this.audioState === 'paused') this.stopAudio();
            this.currentAudioSurahId = currentSurah.id;
            this.isLoaded = false;
            this.preloadSurahAudio(currentSurah.id);
        }

        this.updateBookmarkPosition(rNum, lNum);
        this._updateRenderModeUI();
        this.updatePlayingVerseHighlight();
    },

    // ─── Switch between image and text rendering modes ───────────────────────
    setRenderMode(mode) {
        if (mode === this.renderMode) return;
        this.renderMode = mode;
        localStorage.setItem('Bayani_reader_mode', mode);

        ['pageRight', 'pageLeft'].forEach(id => {
            const c = document.getElementById(id);
            if (!c) return;

            // Invalidate any in-flight _loadPageText calls so they abort immediately
            c.dataset.mqTok = 'cancelled_' + Date.now();

            const img     = c.querySelector('img');
            const textDiv = c.querySelector('.mq-content');
            const overlay = c.querySelector('.mq-border-overlay');

            if (mode === 'image') {
                // Tear down text mode completely
                c.classList.remove('mq-text-mode');
                c.dataset.mqScale = '';
                c.dataset.mqPad   = '';
                // Remove border frame and ALL banner divs
                c.querySelector('.mq-border-overlay')?.remove();
                c.querySelectorAll('.mq-header-banner').forEach(el => el.remove());
                c.style.removeProperty('padding');
                overlay?.remove();
                if (textDiv) { textDiv.innerHTML = ''; textDiv.style.display = 'none'; }
                // Show image (src will be set by _renderImagePages)
                if (img) { img.style.display = ''; }
            } else {
                // Tear down image mode completely
                if (img) { img.src = ''; img.style.display = 'none'; }
                if (textDiv) { textDiv.style.display = ''; }
            }
        });

        this.render();
    },

    _updateRenderModeUI() {
        const textBtn = document.getElementById('readerModeTextBtn');
        const imgBtn  = document.getElementById('readerModeImgBtn');
        const active  = 'px-2 py-1.5 rounded-md text-xs font-medium transition-all bg-teal-500/20 text-teal-300 border border-teal-500/40';
        const idle    = 'px-2 py-1.5 rounded-md text-xs font-medium transition-all text-gray-400 hover:text-white hover:bg-white/10';
        if (textBtn) textBtn.className = this.renderMode === 'text' ? active : idle;
        if (imgBtn)  imgBtn.className  = this.renderMode === 'image' ? active : idle;
    },

    // ─── Image-based page rendering (classic PNG pages) ──────────────────────
    _renderImagePages(rNum, lNum, isMobile) {
        const load = (num, imgId) => {
            const img = document.getElementById(imgId);
            if (!img) return;
            const parent = img.parentElement;
            if (num > 604 || num < 1) {
                parent.style.display = 'none';
                img.src = '';
                return;
            }
            parent.style.display = '';
            parent.classList.remove('hidden');
            img.style.display = '';
            img.classList.remove('loaded');
            img.src = `https://quran.ksu.edu.sa/png_big/${num}.png`;
            img.onload = () => img.classList.add('loaded');
        };

        load(rNum, 'imgRight');
        if (!isMobile) {
            load(lNum, 'imgLeft');
        } else {
            const leftPage = document.getElementById('pageLeft');
            if (leftPage) leftPage.style.display = 'none';
        }

        const container = document.getElementById('bookContainer');
        if (container && !isMobile) {
            if (lNum < 1 || lNum > 604) container.classList.add('single-page-view');
            else container.classList.remove('single-page-view');
        }
    },

    // ─── Text-based page rendering (Quran API styled text) ───────────────────
    _renderTextPages(rNum, lNum, isMobile) {
        // Ensure ResizeObserver is watching bookContainer
        const _bc = document.getElementById('bookContainer');
        if (_bc && Reader._resizeObserver && !Reader._roAttached) {
            Reader._resizeObserver.observe(_bc);
            Reader._roAttached = true;
        }

        this._loadPageText(rNum, 'pageRight');
        if (!isMobile) {
            const leftPage = document.getElementById('pageLeft');
            if (lNum >= 1 && lNum <= 604) {
                if (leftPage) leftPage.style.display = '';
                this._loadPageText(lNum, 'pageLeft');
            } else {
                if (leftPage) leftPage.style.display = 'none';
            }
        }

        const container = document.getElementById('bookContainer');
        if (container && !isMobile) {
            if (lNum < 1 || lNum > 604) container.classList.add('single-page-view');
            else container.classList.remove('single-page-view');
        }
    },

    // ─── called once to inject font, CSS, tooltip, verse sheet, MQ engine ────
    _initOnce() {
        const MQ_VER = '21';
        const existing = document.getElementById('mq-styles');
        if (existing && existing.dataset.ver === MQ_VER) return;
        if (existing) existing.remove(); // stale version — replace it

        // Scheherazade New — best-in-class Unicode Uthmanic Quran font (SIL / Google Fonts)
        const fl = document.createElement('link');
        fl.rel = 'stylesheet';
        fl.href = 'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Amiri+Quran&family=Amiri&display=swap';
        document.head.appendChild(fl);

        const st = document.createElement('style');
        st.id = 'mq-styles';
        st.dataset.ver = '21';
        st.textContent = `
            /* ── Quran text mode: outer layout chain ── */
            #readerModal > div.flex-1 {
                flex: 1 1 0% !important;
                min-height: 0 !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                padding: 12px 0 !important;
                box-sizing: border-box !important;
            }

            #bookContainer {
                flex: 1 1 0% !important;
                min-height: 0 !important;
                display: flex !important;
                flex-direction: row !important;
                align-items: stretch !important;
                overflow: hidden !important;
            }

            #pageRight.mq-text-mode,
            #pageLeft.mq-text-mode {
                flex: 1 1 0% !important;
                min-height: 0 !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
                position: relative !important;
                align-self: stretch !important;
                background: #e6e6e6 !important;
                border: none !important;
                outline: none;
                /* padding set dynamically in _injectBorderOverlay */
            }

            /* ── Mobile: aspect-ratio + scroll ── */
            @media (max-width: 768px) {
                #readerModal > div.flex-1 {
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                }
                #bookContainer {
                    flex: 0 0 auto !important;
                    overflow: visible !important;
                }
                #pageRight.mq-text-mode {
                    flex: 0 0 auto !important;
                    aspect-ratio: 5 / 7 !important;
                    /* Prevent nested scroller (double scrollbar on mobile) */
                    overflow: hidden !important;
                }
            }

            /* No pseudo-element borders — border-image handles the frame */
            #pageRight.mq-text-mode::before, #pageLeft.mq-text-mode::before,
            #pageRight.mq-text-mode::after,  #pageLeft.mq-text-mode::after {
                content: none !important; display: none !important;
            }

            .mq-content {
                position: relative !important;
                z-index: 1 !important;
                width: 100% !important;
                max-width: 100% !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }

            /* ── Decorative top rule ── */
            .mq-page-top-rule {
                width: 100%;
                text-align: center;
                margin-bottom: 8px;
                color: #4c4441;
                font-size: .65rem;
                letter-spacing: 4px;
                opacity: 0.55;
                user-select: none;
            }

            /* ── Surah banner ── */
            /* ── Surah separator — Mushaf style ── */
            .mq-surah-sep {
                width: 100%;
                margin: 16px 0 12px;
                position: relative;
                direction: rtl;
                box-sizing: border-box;
            }

            /* Image-based separator — outer/inner divs kept for HTML compat but invisible */
            .mq-surah-outer {
                background: none;
                border: none;
                padding: 0;
            }

            .mq-surah-inner {
                background-image: url('/src/img/separator.png');
                background-size: 100% 100%;
                background-repeat: no-repeat;
                border: none;
                border-radius: 0;
                padding: 10px 18% 10px;
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
                gap: 4px;
                position: relative;
                min-height: 48px;
            }

            .mq-surah-inner::before,
            .mq-surah-inner::after { content: none; display: none; }

            /* Left meta: type (مكية/مدنية) */
            .mq-sep-meta-r {
                font-family: 'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif;
                font-size: 0.82rem;
                font-weight: 600;
                color: #3a2200;
                text-align: right;
                line-height: 1.6;
            }

            /* Right meta: verse count */
            .mq-sep-meta-l {
                font-family: 'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif;
                font-size: 0.82rem;
                font-weight: 600;
                color: #3a2200;
                text-align: left;
                line-height: 1.6;
            }

            /* Centre: surah name */
            .mq-sep-name {
                text-align: center;
                font-family: 'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif;
                font-weight: 700;
                font-size: clamp(1.08rem, 2vw, 1.4rem);
                color: #3a2200;
                letter-spacing: 0.5px;
                white-space: nowrap;
                padding: 0 6px;
            }

            /* Number badge inside the name */
            .mq-sep-num {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 0;
                height: auto;
                text-align: center;
                border: none;
                background: transparent;
                font-size: 0.66rem;
                font-weight: 700;
                color: #3a2200;
                margin-inline-start: 6px;
                vertical-align: middle;
            }

            /* ── Bismillah ── */
            .mq-bismillah {
                text-align: center;
                font-family: 'p1-v2', 'Amiri Quran', 'Scheherazade New', serif;
                font-size: clamp(2.28rem, 4.2vw, 3.2rem);
                font-weight: 500;
                color: #1a1008;
                padding: 4px 0 6px;
                line-height: 2.1;
                direction: rtl;
            }


            /* ── One div = exactly one physical Mushaf line ──
               Because each div contains only ONE line of text, it is simultaneously
               the first AND last line — so text-align-last:justify fires on every
               single row. inter-word stretches only spaces, never letter-spacing.  */
            .mq-line {
                display: block;
                direction: rtl;
                text-align: justify;
                text-align-last: justify;
                text-justify: inter-word;
                font-family: var(--qpc-font, 'Scheherazade New', 'Amiri Quran', 'Amiri', serif);
                font-size: clamp(2.12rem, 3.8vw, 2.95rem);
                font-weight: 550;
                line-height: 1.9;
                color: #1a1008;
                -webkit-font-smoothing: antialiased;
                width: 100%;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                font-feature-settings: 'calt' 1, 'liga' 1, 'clig' 1, 'kern' 1;
                font-kerning: normal;
                text-rendering: optimizeLegibility;
            }

            /* ── Clickable word ── */
            .mq-w {
                display: inline;
                cursor: pointer;
                border-radius: 2px;
                padding: 0;
                transition: background .12s;
            }
            .mq-w:hover { background: rgba(45,90,79,.12); }

            /* ── Waqf / pause marks — visible but not interactive ── */
            .mq-waqf {
                display: inline;
                color: #8c6c3a;
                font-family: var(--qpc-font, 'Scheherazade New', 'Amiri Quran', serif);
                pointer-events: none;
                user-select: none;
                border-radius: 0;
                padding: 0;
            }

            /* ── Verse end ornament ﴾٢٤﴿ ── */
            .mq-end {
                display: inline;
                color: #1a1008;
                font-family: var(--qpc-font, 'Scheherazade New', 'Amiri Quran', serif);
                font-size: 1em;
                font-weight: 500;
                cursor: pointer;
                padding: 0;
                line-height: inherit;
                vertical-align: baseline;
                white-space: nowrap;
                border-radius: 999px;
                transition: color .12s, background-color .12s, box-shadow .12s;
            }
            .mq-end:hover { color: inherit; }
            .mq-end.sel { color: #3a2a1a; }
            .mq-w.playing-ayah,
            .mq-waqf.playing-ayah,
            .mq-end.playing-ayah,
            .mq-w.hover-ayah,
            .mq-waqf.hover-ayah,
            .mq-end.hover-ayah,
            .mq-w.selected-ayah,
            .mq-waqf.selected-ayah,
            .mq-end.selected-ayah {
                background: rgba(200,154,118,.42) !important;
                box-shadow: inset 0 -1px 0 rgba(172,126,93,.38);
                border-radius: 0;
                padding: 0 .03em;
            }

            /* ── Page number footer — hidden; shown in border strip instead ── */
            .mq-page-num {
                display: none !important;
            }

            /* ── Skeleton shimmer ── */
            .mq-skel-line {
                height: 14px;
                border-radius: 3px;
                background: linear-gradient(90deg, #ede5d0 25%, #dfd3bc 50%, #ede5d0 75%);
                background-size: 200% 100%;
                animation: mqSk 1.4s linear infinite;
                margin-bottom: 22px;
            }
            @keyframes mqSk {
                0%   { background-position: 200% 0 }
                100% { background-position: -200% 0 }
            }

            /* ── Word tooltip ── */
            #mq-tip {
                position: fixed;
                z-index: 9999;
                background: linear-gradient(160deg,#1a2535,#111c2a);
                border: 1px solid rgba(196,160,48,.32);
                border-radius: 14px;
                padding: 14px 16px 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,.55);
                max-width: 224px;
                min-width: 160px;
                opacity: 0;
                pointer-events: none;
                transform: translateY(6px) scale(.95);
                transition: opacity .14s, transform .14s;
                direction: rtl;
                visibility: hidden;
            }
            #mq-tip.vis {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
                visibility: visible;
            }
            .mtt-ar {
                font-family: 'Scheherazade New', 'Amiri Quran', 'Amiri', serif;
                font-size: 1.6rem;
                color: #f5ecd4;
                text-align: center;
                line-height: 1.5;
                margin-bottom: 3px;
            }
            .mtt-rl {
                font-family: Georgia, serif;
                font-size: .78rem;
                color: #4dd9c0;
                font-style: italic;
                letter-spacing: .03em;
                text-align: center;
                direction: ltr;
                margin-bottom: 0;
            }
            .mtt-div {
                height: 1px;
                background: linear-gradient(90deg,transparent,rgba(196,160,48,.28),transparent);
                margin: 7px 0;
            }
            .mtt-ma {
                font-family: 'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif;
                font-size: .9rem;
                color: #f0e2c4;
                text-align: center;
                direction: rtl;
                line-height: 1.55;
                margin-bottom: 6px;
            }
            .mtt-tr {
                font-family: sans-serif;
                font-size: .74rem;
                color: #c8bfae;
                text-align: center;
                direction: ltr;
                line-height: 1.4;
            }
            .mtt-btns {
                display: flex;
                gap: 6px;
                margin-top: 10px;
                justify-content: center;
            }
            .mtt-btn {
                background: rgba(196,160,48,.10);
                border: 1px solid rgba(196,160,48,.24);
                color: #d4b84a;
                border-radius: 7px;
                padding: 4px 11px;
                font-size: .68rem;
                cursor: pointer;
                font-family: sans-serif;
                transition: background .12s;
            }
            .mtt-btn:hover { background: rgba(196,160,48,.22); }

            /* ── Verse bottom sheet ── */
            #mq-sheet {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 9998;
                background: #0d1f1e;
                border-top: 1px solid rgba(45,212,191,.1);
                border-radius: 16px 16px 0 0;
                padding: 14px 20px 32px;
                transform: translateY(100%);
                transition: transform .25s cubic-bezier(.4,0,.2,1);
                direction: rtl;
                box-shadow: 0 -8px 40px rgba(0,0,0,.5);
            }
            #mq-sheet.open { transform: translateY(0); }
            .mts-drag {
                width: 36px;
                height: 4px;
                border-radius: 2px;
                background: rgba(255,255,255,.1);
                margin: 0 auto 14px;
            }
            .mts-ar {
                font-family: 'Scheherazade New', 'Amiri Quran', 'Amiri', serif;
                font-size: 1.15rem;
                color: #4c4441;
                line-height: 2.1;
                text-align: right;
                padding: 9px 12px;
                background: rgba(255,255,255,.03);
                border-radius: 8px;
                border: 1px solid rgba(45,212,191,.08);
                margin-bottom: 8px;
            }
            .mts-tr {
                font-family: sans-serif;
                font-size: .8rem;
                color: #4c4441;
                direction: ltr;
                text-align: left;
                line-height: 1.55;
                padding: 0 4px;
            }
            .mts-tafsir {
                margin-top: 8px;
                font-family: 'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif;
                font-size: .9rem;
                color: #4c4441;
                direction: rtl;
                text-align: right;
                line-height: 1.8;
                padding: 9px 12px;
                background: rgba(255,255,255,.03);
                border-radius: 8px;
                border: 1px solid rgba(45,212,191,.08);
                max-height: 180px;
                overflow-y: auto;
            }
            .mts-btns {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            .mts-btn {
                flex: 1;
                background: rgba(45,212,191,.07);
                border: 1px solid rgba(45,212,191,.13);
                color: #4c4441;
                border-radius: 10px;
                padding: 9px;
                font-size: .75rem;
                cursor: pointer;
                font-family: sans-serif;
            }
            .mts-btn:hover { background: rgba(45,212,191,.12); }
            .mts-close {
                position: absolute;
                top: 14px;
                left: 16px;
                color: #4c4441;
                background: none;
                border: none;
                font-size: 1.1rem;
                cursor: pointer;
                line-height: 1;
            }

            @media (max-width: 768px) {
                #readerModal > div.flex-1 {
                    padding: 8px 0 !important;
                }
                #bookContainer {
                    flex-direction: column !important;
                }
                #pageRight.mq-text-mode {
                    /* padding set dynamically in _injectBorderOverlay */
                }

                /* Make separator lighter/thinner on phones */
                .mq-surah-sep {
                    margin: 8px 0 6px;
                }
                .mq-surah-inner {
                    padding: 5px 12% 5px;
                    min-height: 32px;
                    gap: 2px;
                }
                .mq-sep-name {
                    font-size: clamp(0.9rem, 4.2vw, 1.06rem);
                    letter-spacing: 0.2px;
                    padding: 0 2px;
                }
                .mq-sep-meta-r,
                .mq-sep-meta-l {
                    font-size: 0.68rem;
                    line-height: 1.25;
                }

                /* Improve readability of ayah lines on small screens */
                .mq-line {
                    font-size: clamp(1.5rem, 5.8vw, 2.05rem);
                    line-height: 1.82;
                    font-weight: 540;
                }
                .mq-bismillah {
                    font-size: clamp(1.3rem, 5vw, 1.7rem);
                    line-height: 1.72;
                }
            }

            @media (max-width: 420px) {
                /* On very narrow phones keep separator compact and uncluttered */
                .mq-surah-inner {
                    grid-template-columns: 1fr;
                    padding: 4px 10% 4px;
                    min-height: 28px;
                }
                .mq-sep-meta-r,
                .mq-sep-meta-l {
                    display: none;
                }
            }
        `;

        document.head.appendChild(st);

        // ── Word tooltip ────────────────────────────────────────────────
        const tip = document.createElement('div');
        tip.id = 'mq-tip';
        tip.innerHTML = `
            <div class="mtt-ar" id="mtt-ar"></div>
            <div class="mtt-rl" id="mtt-rl"></div>
            <div class="mtt-div"></div>
            <div class="mtt-ma" id="mtt-ma"></div>
            <div class="mtt-tr" id="mtt-tr"></div>
            <div class="mtt-btns">
                <button class="mtt-btn" id="mtt-copy">نسخ</button>
                <button class="mtt-btn" id="mtt-aud">▶ صوت</button>
            </div>`;
        document.body.appendChild(tip);
        document.addEventListener('click', e => {
            // Close word tooltip if clicking outside it and outside a word
            if (!e.target.closest('#mq-tip') && !e.target.closest('.mq-w')) {
                document.getElementById('mq-tip').classList.remove('vis');
            }
            
            // Close verse bottom sheet if clicking outside it and outside an end marker
            if (!e.target.closest('#mq-sheet') && !e.target.closest('.mq-end')) {
                if (window.MQ) window.MQ.closeSheet();
            }
        });

        // ── Verse sheet ─────────────────────────────────────────────────
        const sh = document.createElement('div');
        sh.id = 'mq-sheet';
        sh.innerHTML = `
            <div class="mts-drag"></div>
            <button class="mts-close" onclick="MQ.closeSheet()">✕</button>
            <div class="mts-ar" id="mts-ar"></div>
            <div class="mts-tr" id="mts-tr"></div>
            <div class="mts-tafsir" id="mts-tafsir">...</div>
            <div class="mts-btns">
                <button class="mts-btn" id="mts-readfrom">🔊 اقرأ من هنا</button>
                <button class="mts-btn" id="mts-copy">📋 نسخ</button>
                <button class="mts-btn" id="mts-share">↗ مشاركة</button>
                <button class="mts-btn" id="mts-bm">🔖 حفظ</button>
            </div>`;
        document.body.appendChild(sh);

        // ── Sheet drag-to-close (mobile friendly) ──────────────────────────
        let dragActive = false;
        let dragStartY = 0;
        let dragDeltaY = 0;
        const TOP_DRAG_ZONE_PX = 170;

        const dragPointY = (ev) => {
            if (ev.touches && ev.touches.length) return ev.touches[0].clientY;
            if (ev.changedTouches && ev.changedTouches.length) return ev.changedTouches[0].clientY;
            return ev.clientY;
        };

        const startDrag = (ev) => {
            if (!sh.classList.contains('open')) return;

            const y = dragPointY(ev);
            const rect = sh.getBoundingClientRect();
            const inTopZone = y <= (rect.top + TOP_DRAG_ZONE_PX);
            if (!inTopZone) return;

            // Ignore interactive controls
            const t = ev.target;
            if (t && t.closest && t.closest('button, a, input, textarea, select, .mts-btns')) return;

            // If tafsir panel is scrolled, let it scroll instead of closing sheet
            const tafsirBox = t && t.closest ? t.closest('#mts-tafsir') : null;
            if (tafsirBox && tafsirBox.scrollTop > 0) return;

            dragActive = true;
            dragStartY = y;
            dragDeltaY = 0;
            sh.style.transition = 'none';
            if (ev.cancelable) ev.preventDefault();
        };

        const moveDrag = (ev) => {
            if (!dragActive) return;
            const y = dragPointY(ev);
            dragDeltaY = Math.max(0, y - dragStartY);
            sh.style.transform = `translateY(${dragDeltaY}px)`;
            if (ev.cancelable) ev.preventDefault();
        };

        const endDrag = () => {
            if (!dragActive) return;
            dragActive = false;
            sh.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1)';

            if (dragDeltaY > 80) {
                if (window.MQ?.closeSheet) window.MQ.closeSheet();
                else sh.classList.remove('open');
            } else {
                // Snap back open
                sh.style.transform = '';
            }
        };

        sh.addEventListener('touchstart', startDrag, { passive: false });
        sh.addEventListener('mousedown', startDrag);
        window.addEventListener('touchmove', moveDrag, { passive: false });
        window.addEventListener('mousemove', moveDrag);
        window.addEventListener('touchend', endDrag);
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchcancel', endDrag);

        // ── MQ global interaction engine ────────────────────────────────
        window.MQ = {
            trCache: {},
            tafsirCache: {},
            wbwAudio: null,
            activeKey: null,

            previewVerse(key, on) {
                if (typeof Reader === 'undefined' || !Reader?.setHoverVerse) return;
                Reader.setHoverVerse(key, on);
            },

            previewVerseFromElement(el, on) {
                const key = el?.dataset?.vkey;
                if (!key) return;
                this.previewVerse(key, on);
            },

            async fetchTr(s, v) {
                const k = `${s}:${v}`;
                if (this.trCache[k] !== undefined) return this.trCache[k];
                try {
                    const d = await (await fetch(
                        `https://api.quran.com/api/v4/verses/by_key/${s}:${v}?translations=131`
                    )).json();
                    const t = (d?.verse?.translations?.[0]?.text || '').replace(/<[^>]+>/g, '');
                    return (this.trCache[k] = t);
                } catch { return (this.trCache[k] = ''); }
            },

            async fetchTafsir(s, v) {
                const k = `${s}:${v}`;
                if (this.tafsirCache[k] !== undefined) return this.tafsirCache[k];
                try {
                    const d = await (await fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah/${s}:${v}`)).json();
                    const t = (d?.tafsir?.text || '').replace(/<[^>]+>/g, '');
                    return (this.tafsirCache[k] = t);
                } catch { return (this.tafsirCache[k] = ''); }
            },

            showWord(el) {
                try {
                    const w   = JSON.parse(el.dataset.w);
                    const s = +el.dataset.s, v = +el.dataset.v;
                    // data-audio holds the API's own audio_url (relative or absolute)
                    const audioPath = el.dataset.audio || '';
                    const audioUrl  = audioPath
                        ? (audioPath.startsWith('http') ? audioPath : 'https://audio.qurancdn.com/' + audioPath)
                        : null;

                    document.getElementById('mtt-ar').textContent = w.t || '';
                    document.getElementById('mtt-rl').textContent = w.r || '';
                    document.getElementById('mtt-ma').textContent = w.ma || '—';
                    const trEl = document.getElementById('mtt-tr');
                    trEl.textContent = w.m || '';
                    trEl.style.display = (w.m && String(w.m).trim()) ? '' : 'none';
                    const tip = document.getElementById('mq-tip');
                    const r = el.getBoundingClientRect();
                    const pw = 220, ph = 148;
                    let top = r.top - ph - 8;
                    if (top < 8) top = r.bottom + 8;
                    let left = r.left + r.width / 2 - pw / 2;
                    left = Math.max(8, Math.min(left, innerWidth - pw - 8));
                    tip.style.top = top + 'px';
                    tip.style.left = left + 'px';
                    tip.style.width = pw + 'px';
                    tip.classList.add('vis');
                    document.getElementById('mtt-copy').onclick = () => {
                        navigator.clipboard?.writeText(w.t || '');
                        const btn = document.getElementById('mtt-copy');
                        btn.textContent = '✓';
                        setTimeout(() => btn.textContent = 'نسخ', 1500);
                    };
                    const audioBtn = document.getElementById('mtt-aud');
                    audioBtn.disabled = !audioUrl;
                    audioBtn.textContent = audioUrl ? '▶ صوت' : '—';
                    audioBtn.title = audioUrl ? '' : 'لا يوجد صوت';
                    audioBtn.onclick = () => {
                        const btn = document.getElementById('mtt-aud');
                        if (this.wbwAudio) { this.wbwAudio.pause(); this.wbwAudio.src = ''; this.wbwAudio = null; }
                        if (!audioUrl) return;
                        btn.textContent = '⏳'; btn.disabled = true;
                        this.wbwAudio = new Audio(audioUrl);
                        this.wbwAudio.oncanplaythrough = () => { btn.textContent = '🔊'; btn.disabled = false; };
                        this.wbwAudio.onended  = () => { btn.textContent = '▶ صوت'; btn.disabled = false; };
                        this.wbwAudio.onerror  = () => { btn.textContent = '✗';      btn.disabled = false; };
                        this.wbwAudio.play().catch(() => { btn.textContent = '▶ صوت'; btn.disabled = false; });
                    };
                } catch (e) { console.warn('showWord', e); }
            },

            async showSheet(el, s, v, text) {
                document.querySelectorAll('.mq-end.sel').forEach(x => x.classList.remove('sel'));
                const k = `${s}:${v}`;
                const sheet = document.getElementById('mq-sheet');
                if (this.activeKey === k && sheet.classList.contains('open')) {
                    this.closeSheet();
                    return;
                }
                this.activeKey = k;
                if (typeof Reader !== 'undefined' && Reader?.setSelectedVerse) Reader.setSelectedVerse(k);
                el.classList.add('sel');
                document.getElementById('mts-ar').textContent = text;
                document.getElementById('mts-tr').textContent = '...';
                document.getElementById('mts-tafsir').textContent = 'جاري تحميل التفسير...';
                sheet.style.transform = '';
                sheet.style.transition = '';
                sheet.classList.add('open');
                const tr = await this.fetchTr(s, v);
                document.getElementById('mts-tr').textContent = tr || '—';
                const tafsir = await this.fetchTafsir(s, v);
                document.getElementById('mts-tafsir').textContent = tafsir || 'التفسير غير متوفر حالياً.';
                document.getElementById('mts-readfrom').onclick = async () => {
                    await Reader.playFromVerseKey(`${s}:${v}`);
                    this.closeSheet();
                };
                document.getElementById('mts-copy').onclick = () => {
                    navigator.clipboard?.writeText(`${text}\n[${s}:${v}]`);
                    const b = document.getElementById('mts-copy');
                    b.textContent = '✓ تم';
                    setTimeout(() => b.textContent = '📋 نسخ', 2000);
                };
                document.getElementById('mts-share').onclick = async () => {
                    const msg = `${text}\n${tr}\n[${s}:${v}]`;
                    if (navigator.share) await navigator.share({ text: msg }).catch(() => {});
                    else navigator.clipboard?.writeText(msg);
                };
                document.getElementById('mts-bm').onclick = async () => {
                    const b = document.getElementById('mts-bm');
                    b.textContent = '⏳';
                    b.disabled = true;
                    const ayahKey = `${s}:${v}`;
                    // Always persist to localStorage for guests/offline
                    const bms = JSON.parse(localStorage.getItem('Bayani_bookmarks') || '[]');
                    if (!bms.find(x => x.s === s && x.v === v))
                        bms.push({ s, v, text, date: new Date().toISOString() });
                    localStorage.setItem('Bayani_bookmarks', JSON.stringify(bms));
                    // If logged in, also save to Supabase saved_ayahs table
                    try {
                        const sb = window.HadithEngine?.sb || window.sb;
                        if (sb) {
                            const { data: { user } } = await sb.auth.getUser();
                            if (user) {
                                const tr = document.getElementById('mts-tr')?.textContent || '';
                                await sb.from('saved_ayahs').upsert({
                                    user_id: user.id,
                                    surah_number: s,
                                    verse_number: v,
                                    ayah_key: ayahKey,
                                    ayah_text: text,
                                    translation: tr !== '...' && tr !== '—' ? tr : null,
                                    created_at: new Date().toISOString()
                                }, { onConflict: 'user_id,ayah_key' });
                            }
                        }
                    } catch (e) { console.warn('[MQ] save ayah error', e); }
                    b.textContent = '✓ محفوظ';
                    b.disabled = false;
                    setTimeout(() => b.textContent = '🔖 حفظ', 2000);
                };
            },

            closeSheet() {
                const sheet = document.getElementById('mq-sheet');
                if (sheet) {
                    sheet.classList.remove('open');
                    sheet.style.transform = '';
                    sheet.style.transition = '';
                }
                document.querySelectorAll('.mq-end.sel').forEach(x => x.classList.remove('sel'));
                this.activeKey = null;
                if (typeof Reader !== 'undefined' && Reader?.setSelectedVerse) Reader.setSelectedVerse(null);
            }
        };

        if (!window.MQ._delegatedHoverBound) {
            window.MQ._delegatedHoverBound = true;

            document.addEventListener('mouseover', (e) => {
                const end = e.target?.closest?.('.mq-end[data-vkey]');
                if (!end) return;
                window.MQ.previewVerse(end.dataset.vkey, true);
            });

            document.addEventListener('mouseout', (e) => {
                const end = e.target?.closest?.('.mq-end[data-vkey]');
                if (!end) return;
                const to = e.relatedTarget;
                if (to && end.contains(to)) return;
                window.MQ.previewVerse(end.dataset.vkey, false);
            });
        }

        // ── ResizeObserver: re-fit both pages whenever the container resizes ──
        // This handles window resize, orientation change, sidebar toggle, etc.
        if (!Reader._resizeObserver) {
            let _rofTimer = null;
            Reader._resizeObserver = new ResizeObserver(() => {
                clearTimeout(_rofTimer);
                _rofTimer = setTimeout(() => {
                    // Border first — stores dataset.mqPad; then force reflow before fitting
                    ['pageRight','pageLeft'].forEach(id => {
                        const c = document.getElementById(id);
                        if (!c?.classList.contains('mq-text-mode')) return;
                        Reader._injectBorderOverlay(c, parseInt(c.dataset.mqPage));
                        void c.offsetWidth; // force reflow so child widths reflect new padding
                        Reader._fitToPage(c, parseInt(c.dataset.mqPage));
                    });
                    Reader._syncSpread();
                }, 80);
            });
        }
        // Observe bookContainer now — safe to call even if already observing
        const _bc = document.getElementById('bookContainer');
        if (_bc && Reader._resizeObserver) Reader._resizeObserver.observe(_bc);
    },

    // ─── async: fetch page verses and render text into a page container ──────
    _qpcCache: new Set(),
    _basmalaGlyphs: null,

    async _fetchBasmalaGlyphs() {
        if (this._basmalaGlyphs) return this._basmalaGlyphs;
        try {
            const res = await fetch('https://api.quran.com/api/v4/verses/by_key/1:1?words=true&word_fields=code_v2');
            const data = await res.json();
            const words = (data?.verse?.words || []).filter(w => w.char_type_name === 'word');
            this._basmalaGlyphs = words.map(w => w.code_v2 || w.text_uthmani).join(' ');
        } catch(e) {
            this._basmalaGlyphs = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
        }
        return this._basmalaGlyphs;
    },

    _loadQPCFont(pageNum) {
        const family = `p${pageNum}-v2`;
        if (!this._qpcCache.has('p1')) {
            const s1 = document.createElement('style');
            s1.textContent = "@font-face{font-family:'p1-v2';src:url('https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p1.woff2') format('woff2');font-display:swap;}";
            document.head.appendChild(s1);
            this._qpcCache.add('p1');
        }
        if (this._qpcCache.has(pageNum)) return family;
        const url = `https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p${pageNum}.woff2`;
        const s = document.createElement('style');
        s.textContent = `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-display:swap;}`;
        document.head.appendChild(s);
        this._qpcCache.add(pageNum);
        return family;
    },

    async _loadPageText(num, containerId) {
        const container = document.getElementById(containerId);
        if (!container || num < 1 || num > 604) return;

        // Stale-render token: if a newer call starts before this one finishes, abort
        const tok = `${num}_${Date.now()}`;
        container.dataset.mqTok  = tok;
        container.dataset.mqPage = num;

        // Bail immediately if we've switched away from text mode
        if (Reader.renderMode !== 'text') return;

        // Switch container styling to text mode
        container.classList.add('mq-text-mode');
        if (!this._basmalaGlyphs) this._fetchBasmalaGlyphs(); // fire-and-forget, caches for later

        // Hide the original <img> — we no longer use it
        const img = container.querySelector('img');
        if (img) { img.src = ''; img.style.display = 'none'; }

        // Get or create our text content div (persistent, we just replace its innerHTML)
        let textDiv = container.querySelector('.mq-content');
        if (!textDiv) {
            textDiv = document.createElement('div');
            textDiv.className = 'mq-content';
            textDiv.style.width = '100%';
            container.appendChild(textDiv);
        }

        // Show skeleton while loading
        const skelWidths = [95, 88, 92, 85, 93, 80, 95, 87, 91, 60];
        textDiv.innerHTML = skelWidths
            .map(w => `<div class="mq-skel-line" style="width:${w}%"></div>`)
            .join('');

        try {
            // Ensure surah metadata is available before we need it for separators
            if (Reader.surahs.length === 0 || !Reader.surahs[0].hasOwnProperty('verses')) {
                await Reader.fetchSurahs();
            }

            const res = await fetch(
                `https://api.quran.com/api/v4/verses/by_page/${num}` +
                `?words=true` +
                `&word_translation_language=ar` +
                `&word_fields=text_uthmani,transliteration,translation,char_type_name,line_number,page_number,audio_url` +
                `&per_page=300`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const verses = data?.verses || [];
            if (!verses.length) throw new Error('No verses returned');

            // Abort if a newer render call has taken over OR we switched to image mode
            if (container.dataset.mqTok !== tok || Reader.renderMode !== 'text') return;

            let html = '';
            // ── Pass 1: group tokens by physical Mushaf line_number ──
            const lineMap   = {};   // line# → [tokenHtml, …]
            const lineOrder = [];   // ordered unique line numbers
            // surahBreaks[line#] = { sep html, bismillah? } — inserted before that line
            const lineBreaks = {};
            let lastSid = null;

            const addToLine = (ln, tokenHtml) => {
                if (!lineMap[ln]) { lineMap[ln] = []; lineOrder.push(ln); }
                lineMap[ln].push(tokenHtml);
            };

            for (const verse of verses) {
                const [sidStr, vnumStr] = (verse.verse_key || '').split(':');
                const sid  = verse.chapter_id  ?? parseInt(sidStr,  10);
                const vnum = verse.verse_number ?? parseInt(vnumStr, 10);
                if (!sid || !vnum) continue;

                // Keep only tokens that belong to this physical page to avoid
                // cross-page bleed on spread boundaries. If API tagging is inconsistent
                // and yields zero tokens for this page, fall back to all tokens.
                const allWords = (verse.words || []).filter(w => w.text_uthmani?.trim() || w.code_v2?.trim());
                const wordsOnPage = allWords.filter(w => {
                    if (w.page_number == null) return true;
                    return +w.page_number === +num;
                });
                const words = wordsOnPage.length ? wordsOnPage : allWords;
                const endWord  = words.find(w => w.char_type_name === 'end') || allWords.find(w => w.char_type_name === 'end');

                // ── Surah separator at verse 1 ──
                if (sid !== lastSid) {
                    lastSid = sid;
                    if (vnum === 1) {
                        const firstLn = words[0]?.line_number || endWord?.line_number || 0;
                        let sepHtml = '';
                        try {
                            const surahInfo = Reader.surahs.find(s => +s.id === +sid);
                            const nameAr = surahInfo?.nameAr || ('سورة ' + sid);
                            const numAr  = engine.toArabic(+sid || 0);
                            const vCount = (surahInfo?.verses != null) ? engine.toArabic(+surahInfo.verses) + ' آية' : '';
                            const typeAr = surahInfo?.type === 'madinah' ? 'مدنية' : surahInfo?.type === 'makkah' ? 'مكية' : '';
                            sepHtml = `<div class="mq-surah-sep"><div class="mq-surah-outer"><div class="mq-surah-inner">` +
                                `<div class="mq-sep-meta-r">${typeAr}</div>` +
                                `<div class="mq-sep-name">سورة ${nameAr}<span class="mq-sep-num">${numAr}</span></div>` +
                                `<div class="mq-sep-meta-l">${vCount}</div>` +
                                `</div></div></div>`;
                            if (sid !== 1 && sid !== 9) {
                                const bGlyphs = this._basmalaGlyphs || 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
                                sepHtml += `<div class="mq-bismillah">${bGlyphs}</div>`;
                            }
                        } catch(e) {
                            sepHtml = `<div class="mq-surah-sep"><div class="mq-surah-outer"><div class="mq-surah-inner"><div class="mq-sep-name">سورة ${sid}</div></div></div></div>`;
                        }
                        // Attach break BEFORE the first line of this surah
                        if (!lineBreaks[firstLn]) lineBreaks[firstLn] = '';
                        lineBreaks[firstLn] = sepHtml + lineBreaks[firstLn];
                    }
                }

                const verseText = words.map(w => w.text_uthmani).join(' ');
                const safeTxt   = verseText.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                let lastLn  = words[words.length - 1]?.line_number || 0;
                let wordPos = 0; // sequential count of 'word' tokens only

                for (let wi = 0; wi < words.length; wi++) {
                    const w  = words[wi];
                    const ln = w.line_number || 0;
                    lastLn   = ln;

                    if (w.char_type_name === 'end') {
                        // Verse-end ornament: code_v2 glyph contains the styled ﴿٩﴾ mark
                        const endGlyph = w.code_v2 || ('\uFD3F' + engine.toArabic(vnum) + '\uFD3E');
                        addToLine(ln, `<span class="mq-end" data-vkey="${sid}:${vnum}" onpointerenter="MQ.previewVerse('${sid}:${vnum}',true)" onpointerleave="MQ.previewVerse('${sid}:${vnum}',false)" onmouseenter="MQ.previewVerse('${sid}:${vnum}',true)" onmouseleave="MQ.previewVerse('${sid}:${vnum}',false)" onclick="event.stopPropagation();MQ.showSheet(this,${sid},${vnum},'${safeTxt}')">${endGlyph} </span>`);
                        continue;
                    }
                    if (w.char_type_name !== 'word') {
                        // Waqf / pause / ornament — non-clickable
                        addToLine(ln, `<span class="mq-waqf" data-s="${sid}" data-v="${vnum}" data-vkey="${sid}:${vnum}">${w.code_v2 || w.text_uthmani} </span>`);
                        continue;
                    }

                    wordPos++;
                    // Build CDN URL from wordPos (underscore format: 002_282_011.mp3).
                    // We do NOT use w.audio_url — the API returns wrong positions for words
                    // that follow an embedded waqf mark (e.g. wi=10 gets 012 instead of 011).
                    const pad3  = n => String(n).padStart(3, '0');
                    const audio = `wbw/${pad3(sid)}_${pad3(vnum)}_${pad3(wordPos)}.mp3`;

                    // Use text_uthmani for display (no QPC glyphs); code_v2 removed.
                    const waqfRe    = /[\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0615]+/g;
                    const useGlyph  = false;
                    const cleanText = (w.text_uthmani || '').replace(waqfRe, '').trim();
                    const waqfParts = (w.text_uthmani || '').match(waqfRe);
                    const tooltipTxt = cleanText;

                    const wordMeaningAr = String(w.translation?.text || '').replace(/<[^>]+>/g, '');

                    const t = tooltipTxt.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
                    const r = (w.transliteration?.text || '').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
                    const m = '';
                    const ma = wordMeaningAr.replace(/"/g, '&quot;').replace(/'/g, '&apos;');

                    let token = `<span class="mq-w" data-s="${sid}" data-v="${vnum}" data-vkey="${sid}:${vnum}" data-audio="${audio}"` +
                        ` data-w='{"t":"${t}","r":"${r}","m":"${m}","ma":"${ma}"}' onclick="event.stopPropagation();MQ.showWord(this)">` +
                        `${cleanText} </span>`;
                    // Re-attach any waqf marks after the word span (visible, non-clickable)
                    if (waqfParts) token += `<span class="mq-waqf" data-s="${sid}" data-v="${vnum}" data-vkey="${sid}:${vnum}">${waqfParts.join('')} </span>`;
                    addToLine(ln, token);
                }

                // Verse-end ornament rendered inline via code_v2 in loop above
            }

            // ── Pass 2: emit one div per physical line, with surah breaks before lines ──
            const sorted = lineOrder.slice().sort((a, b) => a - b);
            for (const ln of sorted) {
                if (lineBreaks[ln]) html += lineBreaks[ln];
                html += `<div class="mq-line">${lineMap[ln].join('')}</div>`;
            }
            html += `<div class="mq-page-num">${engine.toArabic(num)}</div>`;

            // Inject @font-face for this page (CSS subresource, no CORS/fetch involved)
            const qpcFamily = this._loadQPCFont(num);
            if (container.dataset.mqTok !== tok) return;
            container.style.setProperty('--qpc-font',
                `'${qpcFamily}', 'Amiri Quran', 'Scheherazade New', serif`);

            textDiv.style.visibility = 'hidden';
            textDiv.innerHTML = html;

            const _fitWhenReady = () => {
                if (container.dataset.mqTok !== tok) return;
                this._injectBorderOverlay(container, num);
                void container.offsetWidth;
                this._fitToPage(container, num);
                textDiv.style.visibility = '';
                if (typeof Reader !== 'undefined' && Reader.updatePlayingVerseHighlight) {
                    Reader.updatePlayingVerseHighlight();
                }
                setTimeout(() => {
                    if (container.dataset.mqTok !== tok) return;
                    this._injectBorderOverlay(container, num);
                    void container.offsetWidth;
                    this._fitToPage(container, num);
                    if (typeof Reader !== 'undefined' && Reader.updatePlayingVerseHighlight) {
                        Reader.updatePlayingVerseHighlight();
                    }
                }, 300);
            };
            requestAnimationFrame(() => requestAnimationFrame(_fitWhenReady));

        } catch (err) {
            if (container.dataset.mqTok !== tok) return;
            console.error('[Reader._loadPageText]', num, err);
            textDiv.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;' +
                'justify-content:center;min-height:260px;gap:12px;">' +
                    '<span style="font-family:Amiri,serif;font-size:1.8rem;color:#4c4441">' +
                        'ص ' + engine.toArabic(num) +
                    '</span>' +
                    '<span style="font-family:sans-serif;font-size:.72rem;color:#4c4441">' +
                        'تعذّر التحميل' +
                    '</span>' +
                    '<button onclick="Reader.render()"' +
                    ' style="font-family:sans-serif;font-size:.7rem;color:#4c4441;' +
                    'background:rgba(45,90,79,.1);border:1px solid rgba(45,90,79,.25);' +
                    'padding:6px 14px;border-radius:6px;cursor:pointer;">إعادة المحاولة</button>' +
                '</div>';
        }
    },

    // ─── Scales text to fill page ── page-number aware ───────────────────────
    _fitToPage(container, pageNum) {
        const content = container.querySelector('.mq-content');
        if (!content) return;

        // Read padding from dataset.mqPad (set by _injectBorderOverlay) so we
        // get the exact value regardless of whether getComputedStyle has reflowed yet.
        const pad     = parseFloat(container.dataset.mqPad) || 0;
        const availH  = container.clientHeight - pad * 2;
        const availW  = container.clientWidth  - pad * 2;
        if (availH < 50 || availW < 50) {
            requestAnimationFrame(() => Reader._fitToPage(container, pageNum));
            return;
        }

        const elems = [...content.querySelectorAll('.mq-line, .mq-bismillah, .mq-surah-sep')];
        if (!elems.length) return;

        // ── Reset all previous inline styles ──
        content.style.paddingTop = '';
        elems.forEach(el => {
            el.style.fontSize      = '';
            el.style.lineHeight    = '';
            el.style.marginBottom  = '';
            el.style.textAlign     = '';
            el.style.textAlignLast = '';
        });

        // Special pages: Fatihah (1), first page of Baqarah (2), last 5 pages (600-604)
        const p = pageNum || parseInt(container.dataset.mqPage) || 0;
        const isSpecialPage = (p === 1 || p === 2 || p >= 600);

        // Overflow = text taller than the content area, or any line wider than content.
        // We use BOTH scrollWidth and getBoundingClientRect so paint-time rounding
        // doesn't let a line sneak past the boundary.
        const overflows = () => {
            if (content.scrollHeight > availH + 1) return true;
            for (const ln of content.querySelectorAll('.mq-line')) {
                if (ln.scrollWidth > availW) return true;
                // getBoundingClientRect picks up sub-pixel overflow scrollWidth misses
                if (ln.getBoundingClientRect().width > availW + 1) return true;
            }
            return false;
        };

        const baseSizes = elems.map(el => parseFloat(getComputedStyle(el).fontSize));

        if (isSpecialPage) {
            // Mark as special so _syncSpread skips this container
            container.dataset.mqSpecial = '1';

            // ── SPECIAL PAGES: center all lines, tight line-height (1.5× font), no gaps ──
            let lo = 0.35, hi = 2.0;
            for (let i = 0; i < 18; i++) {
                const mid = (lo + hi) / 2;
                elems.forEach((el, j) => {
                    el.style.fontSize   = (baseSizes[j] * mid) + 'px';
                    el.style.lineHeight = (baseSizes[j] * mid * 1.5) + 'px';
                });
                if (overflows()) hi = mid; else lo = mid;
            }
            const fs = lo * 0.95;
            elems.forEach((el, j) => {
                el.style.fontSize   = (baseSizes[j] * fs) + 'px';
                el.style.lineHeight = (baseSizes[j] * fs * 1.5) + 'px';
            });
            // Center all lines horizontally
            content.querySelectorAll('.mq-line').forEach(ln => {
                ln.style.textAlign     = 'center';
                ln.style.textAlignLast = 'center';
            });
            // Center block vertically
            const rem = availH - content.scrollHeight;
            if (rem > 2) content.style.paddingTop = (rem / 2) + 'px';

        } else {
            container.dataset.mqSpecial = '';

            // ── NORMAL PAGES: binary-search for the right font scale ──
            const baseLH = elems.map(el => parseFloat(getComputedStyle(el).lineHeight));
            let lo = 0.35, hi = 2.0;
            for (let i = 0; i < 18; i++) {
                const mid = (lo + hi) / 2;
                elems.forEach((el, j) => {
                    el.style.fontSize   = (baseSizes[j] * mid) + 'px';
                    el.style.lineHeight = (baseLH[j]    * mid) + 'px';
                });
                if (overflows()) hi = mid; else lo = mid;
            }
            const fs = lo * 0.95;   // 5 % safety gap — keeps lines clear of the border
            elems.forEach((el, j) => {
                el.style.fontSize   = (baseSizes[j] * fs) + 'px';
                el.style.lineHeight = (baseLH[j]    * fs) + 'px';
            });

            // ── Store scale metadata so _syncSpread can equalise both pages ──
            container.dataset.mqScale     = String(fs);
            container.dataset.mqBaseSizes = JSON.stringify(baseSizes);
            container.dataset.mqBaseLH    = JSON.stringify(baseLH);
            container.dataset.mqAvailH    = String(availH);

            if (window.innerWidth <= 768) {
                // Mobile: single page — distribute remaining space evenly as
                // line-height only if the gap is small (< 15% of availH).
                // Otherwise just vertically center the block.
                const remainH = availH - content.scrollHeight;
                const lines   = [...content.querySelectorAll('.mq-line')];
                if (remainH > 0 && lines.length > 1) {
                    if (remainH / availH < 0.15) {
                        // Small gap — spread across lines
                        const extra = remainH / lines.length;
                        lines.forEach(ln => {
                            const cur = parseFloat(ln.style.lineHeight) || parseFloat(getComputedStyle(ln).lineHeight);
                            ln.style.lineHeight = (cur + extra) + 'px';
                        });
                    } else {
                        // Large gap — center block vertically instead
                        content.style.paddingTop = (remainH / 2) + 'px';
                    }
                }
            } else {
                // ── Desktop: synchronise the two-page spread ──
                this._syncSpread();
            }
        }
    },

    // ─── Equalise font scale across both pages of a spread ───────────────────
    // Called after each page is fitted. When both pages have stored their scale
    // the method re-applies whichever scale is smaller (the binding constraint)
    // to BOTH pages, then distributes remaining vertical space as evenly-increased
    // line-heights so every page fills top-to-bottom like a printed Mushaf.
    _syncSpread() {
        if (window.innerWidth <= 768) return; // mobile: single page, no spread sync needed
        const right = document.getElementById('pageRight');
        const left  = document.getElementById('pageLeft');
        if (!right || !left || left.style.display === 'none') return;

        // If BOTH are special, nothing to sync
        if (right.dataset.mqSpecial && left.dataset.mqSpecial) return;
        // If one side is special, just distribute vertical space on the normal side
        if (right.dataset.mqSpecial || left.dataset.mqSpecial) {
            const normalSide = right.dataset.mqSpecial ? left : right;
            const availH = parseFloat(normalSide.dataset.mqAvailH || '0');
            const content = normalSide.querySelector('.mq-content');
            if (content && availH > 0) {
                const lines = [...content.querySelectorAll('.mq-line')];
                if (lines.length > 1) {
                    const remainH = availH - content.scrollHeight;
                    if (remainH > 4) {
                        const extra = remainH / lines.length;
                        lines.forEach(ln => {
                            const cur = parseFloat(ln.style.lineHeight)
                                     || parseFloat(getComputedStyle(ln).lineHeight);
                            ln.style.lineHeight = (cur + extra) + 'px';
                        });
                    }
                }
            }
            return;
        }
        const rsStr = right.dataset.mqScale;
        const lsStr = left.dataset.mqScale;
        if (!rsStr || !lsStr) return;

        const minFs = Math.min(parseFloat(rsStr), parseFloat(lsStr));

        [right, left].forEach(container => {
            const content = container.querySelector('.mq-content');
            if (!content) return;

            const baseSizes = JSON.parse(container.dataset.mqBaseSizes || '[]');
            const baseLH    = JSON.parse(container.dataset.mqBaseLH    || '[]');
            const availH    = parseFloat(container.dataset.mqAvailH    || '0');
            const elems     = [...content.querySelectorAll('.mq-line, .mq-bismillah, .mq-surah-sep')];
            if (!elems.length) return;

            // Re-apply the shared minimum scale
            elems.forEach((el, j) => {
                el.style.fontSize   = (baseSizes[j] * minFs) + 'px';
                el.style.lineHeight = (baseLH[j]    * minFs) + 'px';
            });

            // Distribute any remaining vertical space across text lines so
            // both pages fill top-to-bottom (first line top, last line bottom)
            const lines = [...content.querySelectorAll('.mq-line')];
            if (lines.length > 1 && availH > 0) {
                const remainH = availH - content.scrollHeight;
                if (remainH > 4) {
                    const extraPerLine = remainH / lines.length;
                    lines.forEach(ln => {
                        const curLH = parseFloat(ln.style.lineHeight)
                                   || parseFloat(getComputedStyle(ln).lineHeight);
                        ln.style.lineHeight = (curLH + extraPerLine) + 'px';
                    });
                }
            }
        });
    },

    // ─── Mushaf border: multi-frame + geometric corner stars + edge ornaments ───
    _injectBorderOverlay(container, _page) {
        // Remove stale decorations
        container.querySelector('.mq-border-overlay')?.remove();
        container.querySelectorAll('.mq-header-banner').forEach(el => el.remove());

        const W = container.clientWidth;
        const H = container.clientHeight;
        if (W < 60 || H < 60) return;

        const isMobile = window.innerWidth <= 768;

        // Surah / Juz info
        const pageNum      = _page || parseInt(container.dataset.mqPage) || (typeof Reader !== 'undefined' ? Reader.currentPage : 1) || 1;
        const surahs       = (typeof Reader !== 'undefined') ? Reader.surahs || [] : [];
        const currentSurah = [...surahs].reverse().find(s => s.page <= pageNum);
        const surahName    = currentSurah?.nameAr || '';
        const juzNum       = (typeof engine !== 'undefined') ? engine.getJuzByPage(pageNum) : 1;
        const juzAr        = (typeof engine !== 'undefined') ? engine.toArabic(juzNum) : String(juzNum);

        // ── Inset values: how far inside the container the border frame sits ──
        const inset  = isMobile ? 6 : 10;   // px gap between container edge and border
        const SLICE  = 70;
        const BW     = isMobile ? 28 : 44;  // rendered border strip width

        // ── Border frame div ──────────────────────────────────────────────────
        const frame = document.createElement('div');
        frame.className = 'mq-border-overlay';
        Object.assign(frame.style, {
            position:       'absolute',
            top:            inset + 'px',
            left:           inset + 'px',
            right:          inset + 'px',
            bottom:         inset + 'px',
            pointerEvents:  'none',
            zIndex:         '3',
            boxSizing:      'border-box',
            borderStyle:    'solid',
            borderWidth:    BW + 'px',
            borderImage:    `url("/src/img/quran-border.png") ${SLICE} stretch`,
            borderImageWidth: BW + 'px',
            borderImageOutset: '0',
        });
        container.appendChild(frame);

        // ── Set container padding to match frame so text stays inside ─────────
        const pad = inset + BW + 4;
        container.style.setProperty('padding', pad + 'px', 'important');
        // Store the exact pad value so _fitToPage can use it directly —
        // this avoids getComputedStyle timing races where the new padding
        // hasn't been committed to layout yet when _fitToPage runs.
        container.dataset.mqPad = String(pad);

        // ── Top & bottom border strip labels ─────────────────────────────────
        const fontSize  = Math.max(8, Math.min(BW * 0.28, isMobile ? 9.5 : 12));
        // Corner squares are BW×BW — give extra clearance so text never overlaps them
        const cornerClear = BW * 2.2 + (isMobile ? 10 : 18);

        const makeStrip = (topPx, content, justify = 'space-between') => {
            const d = document.createElement('div');
            d.className = 'mq-header-banner';
            Object.assign(d.style, {
                position:       'absolute',
                top:            topPx + 'px',
                left:           (inset + cornerClear) + 'px',
                right:          (inset + cornerClear) + 'px',
                height:         BW + 'px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: justify,
                direction:      'ltr',
                zIndex:         '4',
                pointerEvents:  'none',
                padding:        `0 ${isMobile ? 4 : 8}px`,
                boxSizing:      'border-box',
                overflow:       'hidden',
            });
            d.innerHTML = content;
            container.appendChild(d);
        };

        // Max width for each label = half the available strip width minus some gap
        const stripW = W - 2 * (inset + cornerClear);
        const maxLabelW = Math.floor(stripW * 0.44) + 'px';

        const labelStyle = `
            font-family:'Noto Naskh Arabic','Scheherazade New','Amiri',serif;
            font-size:${fontSize}px;
            font-weight:700;
            color:#2c1400;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            max-width:${maxLabelW};
            line-height:1.15;
            letter-spacing:0.3px;`;

        const numStyle = `
            font-family:'Noto Naskh Arabic','Scheherazade New','Amiri',serif;
            font-size:${fontSize * 1.15}px;
            font-weight:700;
            color:#2c1400;
            line-height:1;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:${isMobile ? 40 : 46}px;
            height:${isMobile ? 18 : 20}px;
            padding: 0 ${isMobile ? 4 : 6}px;
            font-variant-numeric: tabular-nums;
            letter-spacing:0.2px;`;

        // Top: سورة … (right) | الجزء … (left) — no middle filler to avoid overlap
        makeStrip(Math.max(0, inset - (isMobile ? 2 : 3)),
            `<div style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:${isMobile ? 6 : 10}px;">
                <span style="${labelStyle};direction:rtl;text-align:left;flex:1;min-width:0;">الجزء ${juzAr}</span>
                <span style="${labelStyle};direction:rtl;text-align:right;flex:1;min-width:0;">سورة ${surahName}</span>
            </div>`,
            'center'
        );

        // Bottom: page number in a little styled badge
        makeStrip(H - inset - BW + (isMobile ? 8 : 10),
            `<div style="width:100%;display:flex;justify-content:center;align-items:center;">
                <span style="${numStyle}">${(typeof engine !== 'undefined') ? engine.toArabic(pageNum) : pageNum}</span>
            </div>`,
            'center'
        );
    },

    // --- Audio Functions ---
    async _buildSurahVerseQueue(surahId, recitationId) {
        const toAbsoluteUrl = (u) => {
            if (!u) return null;
            if (u.startsWith('http')) return u;
            return `https://audio.qurancdn.com/${u.replace(/^\/+/, '')}`;
        };

        const audioFiles = [];
        let page = 1;
        let hasNext = true;
        let usedChapterOnlyFallback = false;

        if (this.chapterOnlyReciters.has(recitationId)) {
            // Some reciters are available only as chapter audio in public API.
            const chapterRes = await fetch(
                `https://api.quran.com/api/v4/chapter_recitations/${recitationId}/${surahId}`
            );
            const chapterData = await chapterRes.json();
            const chapterUrl = chapterData?.audio_file?.audio_url || null;
            if (!chapterUrl) {
                throw new Error('Chapter-only reciter audio not found for this surah');
            }
            audioFiles.push({ verse_key: `${surahId}:1`, url: chapterUrl });
            usedChapterOnlyFallback = true;
        } else {
            // QuranJS-compatible verse recitations endpoint
            while (hasNext) {
                const verseAudioRes = await fetch(
                    `https://api.quran.com/api/v4/recitations/${recitationId}/by_chapter/${surahId}?per_page=300&page=${page}`
                );
                const verseAudioData = await verseAudioRes.json();
                const chunk = verseAudioData?.audio_files || verseAudioData?.audioFiles || [];
                if (Array.isArray(chunk) && chunk.length) {
                    audioFiles.push(...chunk);
                }

                const nextPage = verseAudioData?.pagination?.next_page;
                hasNext = !!nextPage;
                page = nextPage || 0;
            }
        }

        const absoluteQueue = audioFiles
            .map(a => ({ key: a.verse_key || a.verseKey, url: toAbsoluteUrl(a.url) }))
            .filter(a => a.key && a.url);

        if (!absoluteQueue.length) {
            throw new Error('No verse audio files found for this surah');
        }

        return { absoluteQueue, usedChapterOnlyFallback };
    },

    async playFromVerseKey(verseKey) {
        try {
            const m = String(verseKey || '').match(/^(\d+):(\d+)$/);
            if (!m) throw new Error('Invalid verse key');

            const surahId = Number(m[1]);
            const recitationId = this.selectedRecitationId;
            const stpBtn = document.getElementById('stopAudioBtn');
            if (stpBtn) stpBtn.classList.add('opacity-50');

            // Reset ongoing stream before starting from a new point
            if (this.audioState !== 'stopped') {
                this.stopAudio();
            }

            const { absoluteQueue, usedChapterOnlyFallback } = await this._buildSurahVerseQueue(surahId, recitationId);

            let startIndex = absoluteQueue.findIndex(a => a.key === verseKey);
            if (startIndex === -1) {
                if (usedChapterOnlyFallback) {
                    // Chapter-only fallback cannot start from exact verse.
                    startIndex = 0;
                    console.warn(`[Audio] Reciter ${recitationId} is chapter-only; starting from surah beginning.`);
                } else {
                    throw new Error(`Start verse ${verseKey} not found in recitation queue`);
                }
            }

            this.verseAudioQueue = absoluteQueue.map(a => a.url);
            this.verseAudioKeyQueue = absoluteQueue.map(a => a.key);
            this.verseAudioIndex = startIndex;
            this.currentPlayingVerseKey = this.verseAudioKeyQueue[this.verseAudioIndex] || null;
            this.audioPlayer.src = this.verseAudioQueue[this.verseAudioIndex];
            this.updatePlayingVerseHighlight();

            this.currentAudioSurahId = surahId;
            this.isLoaded = true;

            await this.audioPlayer.play();

            this.audioState = 'playing';
            this.isPlaying = true;
        } catch (e) {
            console.error('Audio load failed', e);
            alert('تعذر تحميل التلاوة.');
            this.audioState = 'stopped';
            this.isPlaying = false;
        }

        this.updateAudioUI();
    },

    async toggleAudio() {
        const trackedPage = this.getTrackedPage();
        const currentSurah = [...this.surahs].reverse().find(
            s => s.page <= trackedPage
        );
        if (!currentSurah) return;

        // 🔹 PLAYING → Pause
        if (this.audioState === 'playing') {
            this.audioPlayer.pause();
            this.audioState = 'paused';
            this.isPlaying = false;
            this.updateAudioUI();
            return;
        }

        // 🔹 PAUSED → Resume (no fetch)
        if (this.audioState === 'paused') {
            try {
                await this.audioPlayer.play();
                this.audioState = 'playing';
                this.isPlaying = true;
            } catch (e) {
                console.error("Resume failed", e);
            }
            this.updateAudioUI();
            return;
        }

        // 🔹 STOPPED → Play verse queue starting at current page (precise, non-approximate)
        try {
            // Find first verse on current page inside current surah (exact starting point)
            const pageVersesRes = await fetch(`https://api.quran.com/api/v4/verses/by_page/${trackedPage}`);
            const pageVersesData = await pageVersesRes.json();
            const pageVerses = pageVersesData?.verses || [];
            const firstPageVerse = pageVerses.find(v => String(v.verse_key || '').startsWith(`${currentSurah.id}:`));

            if (!firstPageVerse?.verse_key) {
                throw new Error('Could not find a verse for current page inside current surah');
            }
            await this.playFromVerseKey(firstPageVerse.verse_key);
            return;
        } catch (e) {
            console.error("Audio load failed", e);
            alert("تعذر تحميل التلاوة.");
            this.audioState = 'stopped';
            this.isPlaying = false;
        }

        this.updateAudioUI();
    }, async preloadSurahAudio(surahId) {
        try {
            const res = await fetch(
                `https://api.quran.com/api/v4/chapter_recitations/${this.selectedRecitationId}/${surahId}`
            );
            const data = await res.json();

            if (data.audio_file?.audio_url) {
                this.audioPlayer.src = data.audio_file.audio_url;
                this.audioPlayer.load();
                this.isLoaded = true;
            }
        } catch (err) {
            console.error("Preload failed", err);
        }
    },

    // Pause: Just freezes the current stream
    pauseAudio() {
        if (this.audioState === 'playing') {
            this.audioPlayer.pause();
            this.audioState = 'paused';
            this.isPlaying = false;
            this.updateAudioUI();
        }
    },

    // Stop: Kills the stream and forces a reload on next Play
    stopAudio() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;

        // 🔥 Clear source completely (forces reload next time)
        this.audioPlayer.src = '';
        this.audioPlayer.load();

        this.audioState = 'stopped';
        this.isPlaying = false;
        this.isLoaded = false;
        this.verseAudioQueue = [];
        this.verseAudioKeyQueue = [];
        this.verseAudioIndex = 0;
        this.currentPlayingVerseKey = null;
        this.hoverVerseKey = null;
        this.updatePlayingVerseHighlight();

        this.updateAudioUI();
    },

    rewindAudio() {
        if (!this.audioPlayer.duration) return;
        this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime - 5);
    },

    forwardAudio() {
        if (!this.audioPlayer.duration) return;
        this.audioPlayer.currentTime = Math.min(
            this.audioPlayer.duration,
            this.audioPlayer.currentTime + 5
        );
    },

    prevSurah() {
        const index = this.surahs.findIndex(s => s.id === this.currentAudioSurahId);
        if (index > 0) {
            const prev = this.surahs[index - 1];

            this.currentPage = prev.page;
            this.stopAudio();
            this.currentAudioSurahId = prev.id;

            this.render();
            this.toggleAudio(); // auto play
        }
    },

    nextSurah() {
        const index = this.surahs.findIndex(s => s.id === this.currentAudioSurahId);
        if (index >= 0 && index < this.surahs.length - 1) {
            const next = this.surahs[index + 1];

            this.currentPage = next.page;
            this.stopAudio();
            this.currentAudioSurahId = next.id;

            this.render();
            this.toggleAudio(); // auto play
        }
    },

    updateAudioUI() {
        const playIcons = document.querySelectorAll('.js-play-icon');
        const stopBtns = document.querySelectorAll('.js-stop-audio');

        if (playIcons.length === 0) return;

        if (this.audioState === 'playing') {
            playIcons.forEach(icon => icon.setAttribute('name', 'pause'));
            stopBtns.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('opacity-50');
            });
        } else { // paused or stopped
            playIcons.forEach(icon => icon.setAttribute('name', 'play'));
            if (this.audioState === 'paused') {
                stopBtns.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('opacity-50');
                });
            } else { // stopped
                stopBtns.forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('opacity-50');
                });
            }
        }
    },
    // -----------------------

    showSurahList(inputElement, show) {
        if (!inputElement) return;
        const wrapper = inputElement.closest('.search-wrapper');
        if (!wrapper) return;
        const list = wrapper.querySelector('.surah-dropdown-list');
        if (!list) return;
        if (show) {
            list.classList.remove('hidden');
            this.filterSurahDropdown(inputElement);
        } else {
            setTimeout(() => list.classList.add('hidden'), 250);
        }
    },

    filterSurahDropdown(inputElement) {
        if (!inputElement) return;
        const wrapper = inputElement.closest('.search-wrapper');
        if (!wrapper) return;
        const list = wrapper.querySelector('.surah-dropdown-list');
        if (!list) return;

        const query = inputElement.value.toLowerCase();

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
        // Hide all lists and clear all inputs
        document.querySelectorAll('.surah-dropdown-list').forEach(l => l.classList.add('hidden'));
        document.querySelectorAll('.surah-search-input').forEach(i => i.value = "");
    },

    goToBookmark() {
        const savedPage = (this.activeMode === 'free') ? engine.state.freePage : engine.state.journey.current_page;
        if (this.getTrackedPage() !== savedPage) {
            this.currentPage = savedPage;
            this.render();
        }
    },

    changePage(dir) {
        const isMobile = window.innerWidth <= 768;
        const step = isMobile ? 1 : 2;

        if (this.activeMode === 'wird' && dir > 0) {
            // Check if the currently viewed spread already reached the target page.
            const { rightPage, leftPage } = this._getVisibleSpreadPages(this.currentPage);
            const maxViewed = isMobile ? rightPage : Math.max(rightPage, leftPage || rightPage);

            if (maxViewed >= this.targetPage) {
                this.showCompletion();
                return;
            }
        }

        let nextVal = this.currentPage + (dir * step);

        // Clamp: first spread starts at 1, last spread starts at 603 ([603,604])
        if (nextVal < 1) nextVal = 1;
        if (nextVal > 603 && !isMobile) nextVal = 603;
        if (nextVal > 604 && isMobile) nextVal = 604;
        if (nextVal === this.currentPage && dir !== 0) return; // already at edge

        this.currentPage = nextVal;
        this.render();
    },

    saveBookmark(side) {
        const isMobile = window.innerWidth <= 768;
        const { rightPage, leftPage } = this._getVisibleSpreadPages(this.currentPage);
        let pageToSave = this.getTrackedPage();

        if (!isMobile) {
            if (side === 'left' && leftPage > 0 && leftPage <= 604) {
                pageToSave = leftPage;
            } else {
                pageToSave = rightPage; // 'right' or no side = right page
            }
        }
        // Mobile: always saves the single visible page (no side distinction needed)

        engine.updateProgress(pageToSave, (this.activeMode === 'free'));
        this.updateBookmarkPosition(rightPage, leftPage);
        this.updatePlayingVerseHighlight();
    },

    // Convenience: bookmark a specific page directly (called from per-page buttons)
    saveBookmarkForPage(pageNum) {
        if (pageNum >= 1 && pageNum <= 604) {
            engine.updateProgress(pageNum, (this.activeMode === 'free'));
            const { rightPage, leftPage } = this._getVisibleSpreadPages(this.currentPage);
            this.updateBookmarkPosition(rightPage, leftPage);
            this.updatePlayingVerseHighlight();
        }
    },

    updateBookmarkPosition(rNum, lNum) {
        const currentSaved = this.activeMode === 'free'
            ? engine.state.freePage
            : (engine.state.journey?.current_page ?? 1);
        const isMobile = window.innerWidth <= 768;

        // ── Per-side bookmark indicators (desktop spread) ─────────────────────
        const bmRight = document.getElementById('physicalBookmarkRight');
        const bmLeft  = document.getElementById('physicalBookmarkLeft');

        if (!isMobile && (bmRight || bmLeft)) {
            // Right page bookmark
            if (bmRight) {
                bmRight.className = '';
                if (currentSaved === rNum)             bmRight.classList.add('bookmark-active');
                else if (currentSaved > rNum)          bmRight.classList.add('bookmark-ahead');
                else                                   bmRight.classList.add('bookmark-behind');
            }
            // Left page bookmark
            if (bmLeft && lNum > 0 && lNum <= 604) {
                bmLeft.className = '';
                if (currentSaved === lNum)             bmLeft.classList.add('bookmark-active');
                else if (currentSaved > lNum)          bmLeft.classList.add('bookmark-ahead');
                else                                   bmLeft.classList.add('bookmark-behind');
            } else if (bmLeft) {
                bmLeft.className = 'bookmark-hidden';
            }
            return; // done — don't fall through to legacy single element
        }

        // ── Legacy single bookmark element (mobile or older HTML) ────────────
        const bookmark = document.getElementById('physicalBookmark');
        if (!bookmark) return;
        bookmark.className = '';
        const maxViewed = isMobile ? rNum : Math.max(rNum, lNum > 0 ? lNum : rNum);
        if (currentSaved === rNum || (!isMobile && lNum > 0 && currentSaved === lNum)) {
            bookmark.classList.add('bookmark-active');
        } else if (currentSaved > maxViewed) {
            bookmark.classList.add('bookmark-ahead');
        } else {
            bookmark.classList.add('bookmark-behind');
        }
    },

    showCompletion() {
        engine.incrementStreak();
        engine.updateProgress(this.targetPage, false);

        // Cycle Khatma Logic: If we hit page 604, automatically cycle khatma_count
        if (this.targetPage >= 604 && this.activeMode === 'wird') {
            if (confirm("🎉 مبارك! لقد أتممت الختمة بنجاح! هل تود البدء بختمة جديدة لزيادة رصيدك؟")) {
                engine.state.journey.current_page = 1;

                // Update all counters to keep them in sync
                const newCompleted = (engine.state.journey.khatmas_completed || 0) + 1;
                engine.state.journey.khatmas_completed = newCompleted;

                engine.save();
                engine.updateUI();

                // FIX: Sync Reader to the new start so close() doesn't think we are ahead
                this.currentPage = 1;

                // Recalculate target for the new khatma immediately
                const dailyGoal = engine.getDailyGoal();
                this.targetPage = Math.min(604, 1 + dailyGoal - 1);
                const indicator = document.getElementById('readerModeIndicator');
                if (indicator) indicator.innerText = `إلى صفحة ${this.toArabic(this.targetPage)}`;

                this.render();
            }
        } else {
            alert("أحسنت! لقد أتممت وردك اليومي.");
        }

        if (confirm("هل تود العودة للرئيسية؟")) {
            this.close(true);
        } else {
            // FIX: Allow user to continue reading by switching to free mode
            this.activeMode = 'free';
            const indicator = document.getElementById('readerModeIndicator');
            if (indicator) indicator.innerText = "قراءة حرة";
        }
    },

    close(skipSave) {
        // Ensure skipSave is strictly boolean true to skip
        const shouldSkip = (skipSave === true);

        const isFree = (this.activeMode === 'free');
        const currentSaved = parseInt(isFree ? engine.state.freePage : (engine.state.journey?.current_page || 1));
        const currentReader = parseInt(this.getTrackedPage());

        if (!shouldSkip && currentReader !== currentSaved) {
            if (confirm(`هل قرأت إلى صفحة ${this.toArabic(currentReader)}؟ سيتم حفظ تقدمك.`)) {
                engine.updateProgress(currentReader, isFree);
            }
        }

        // Ensure Audio is stopped when leaving the reader
        this.stopAudio();

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

const engine = new BayaniKhatma();

// Event Listeners with Corrected RTL Swiping Logic
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
                // RTL Corrected Swiping: 
                // Swipe Left (diffX > 0) -> Next Page (+1)
                // Swipe Right (diffX < 0) -> Previous Page (-1)
                Reader.changePage(diffX > 0 ? -1 : 1);
            }
        }, { passive: true });
    }

    document.getElementById('prevPageBtn')?.addEventListener('click', () => Reader.changePage(-1));
    document.getElementById('nextPageBtn')?.addEventListener('click', () => Reader.changePage(1));

    // ── Keyboard navigation ─────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        const modal = document.getElementById('readerModal');
        if (!modal || modal.classList.contains('hidden')) return;
        // Don't intercept when typing in a search input or any input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':   // RTL: left = forward (next pages, higher numbers)
            case 'PageDown':
                e.preventDefault();
                Reader.changePage(1);
                break;
            case 'ArrowRight':  // RTL: right = backward (prev pages, lower numbers)
            case 'PageUp':
                e.preventDefault();
                Reader.changePage(-1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                Reader.changePage(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                Reader.changePage(-1);
                break;
            case 'Escape':
                Reader.close();
                break;
        }
    });

    // --- Audio Button Binding ---
    // Using class selectors to bind to both desktop and mobile controls
    document.querySelectorAll('.js-play-audio').forEach(btn => btn.addEventListener('click', () => Reader.toggleAudio()));
    document.querySelectorAll('.js-stop-audio').forEach(btn => btn.addEventListener('click', () => Reader.stopAudio()));
    document.querySelectorAll('.js-rewind-audio').forEach(btn => btn.addEventListener('click', () => Reader.rewindAudio()));
    document.querySelectorAll('.js-forward-audio').forEach(btn => btn.addEventListener('click', () => Reader.forwardAudio()));
    document.querySelectorAll('.js-prev-surah').forEach(btn => btn.addEventListener('click', () => Reader.prevSurah()));
    document.querySelectorAll('.js-next-surah').forEach(btn => btn.addEventListener('click', () => Reader.nextSurah()));
    document.querySelectorAll('.js-reciter-select').forEach(select => {
        select.addEventListener('change', (e) => {
            Reader.setRecitationId(e.target.value);
        });
    });
    Reader.syncReciterSelects();

    // Search input listener for transcribed filtering
    document.querySelectorAll('.surah-search-input').forEach(input => {
        input.addEventListener('input', (e) => Reader.filterSurahDropdown(e.target));
        input.addEventListener('focus', (e) => Reader.showSurahList(e.target, true));
        input.addEventListener('blur', (e) => Reader.showSurahList(e.target, false));
    });

    // Binding the bottom external event listeners to their respective engine methods
    document.getElementById('btn-random')?.addEventListener('click', () => engine.setMode('random'));
    document.getElementById('btn-daily')?.addEventListener('click', () => engine.setMode('daily'));
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

        Reader.currentPage = targetPage;
        if (typeof renderReaderPage === 'function') renderReaderPage();
        if (typeof syncReaderHeader === 'function') syncReaderHeader(Reader.currentPage);
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