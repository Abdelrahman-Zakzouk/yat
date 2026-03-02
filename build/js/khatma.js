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
            if (data.streak !== undefined && data.streak !== null) this.state.streak = data.streak;
            if (data.freezes !== undefined && data.freezes !== null) this.state.freezes = data.freezes;
            if (data.last_progress_at) {
                const parsed = new Date(data.last_progress_at);
                if (!isNaN(parsed.getTime())) this.state.lastStreakDate = parsed.toISOString().slice(0, 10);
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
            if (this.state.streak !== data.streak) this.persistProgress();

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
                last_verse_key: `page:${lastPage}`,
                last_page: lastPage,
                start_date: startDate,
                end_date: endDate,
                updated_at: new Date().toISOString(),
                target_khatmas: targetKhatmas,
                khatmas_completed: khatmasCompleted,
                streak: streak,
                freezes: freezes,
                last_progress_at: lastStreakDate ? new Date(lastStreakDate).toISOString() : new Date().toISOString()
            };
            await sb.from('khatma_progress').upsert(payload, { onConflict: 'user_id' });
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

/** * READER LOGIC */
const Reader = {
    currentPage: 1,
    targetPage: 604,
    activeMode: 'wird',
    surahs: [],

    // --- Audio System Additions ---
    audioPlayer: new Audio(),
    isPlaying: false,
    currentAudioSurahId: null,
    audioState: 'stopped', // 'playing' | 'paused' | 'stopped'
    isLoaded: false,
    preloadedAudioUrl: null,
    preloadedSurahId: null,

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

        // Setup Audio Listener 
        this.audioPlayer.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updateAudioUI();
        });
        this.audioPlayer.addEventListener('ended', () => {
            this.audioState = 'stopped';
            this.isPlaying = false;
            this.isLoaded = false;
            this.updateAudioUI();
        });
    },

    async open() {
        await this.fetchSurahs();
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

    render() {
        const isMobile = window.innerWidth <= 768;
        let rNum = this.currentPage;
        let lNum = rNum + 1;

        if (!isMobile) {
            // Standard Madani Layout: [Left: Even, Right: Odd]
            // Exception: Page 1 is always alone on the Right
            if (this.currentPage === 1) {
                rNum = 1;
                lNum = 0; // 0 will be hidden by load()
            } else {
                // Standard Madani: [Right: Even | Left: Odd] -> Read Right(2) then Left(3)
                const isEven = (this.currentPage % 2 === 0);
                const evenPage = isEven ? this.currentPage : this.currentPage - 1;
                rNum = evenPage;      // Right gets Even (e.g. 2)
                lNum = evenPage + 1;  // Left gets Odd (e.g. 3)
            }
        }

        const load = (num, id) => {
            const img = document.getElementById(id);
            if (!img) return;
            if (num > 604 || num < 1) {
                img.parentElement.style.display = 'none';
                img.src = '';
                return;
            }
            img.parentElement.style.display = '';
            img.parentElement.classList.remove('hidden');
            img.classList.remove('loaded');
            img.src = `https://quran.ksu.edu.sa/png_big/${num}.png`;
            img.onload = () => img.classList.add('loaded');
        };

        load(rNum, 'imgRight');
        if (!isMobile) load(lNum, 'imgLeft');

        // Hide spine if only one page is visible (Desktop only)
        const container = document.getElementById('bookContainer');
        if (container && !isMobile) {
            if (lNum < 1 || lNum > 604) {
                container.classList.add('single-page-view');
            } else {
                container.classList.remove('single-page-view');
            }
        }

        const pageInput = document.getElementById('gotoPageInput');
        if (pageInput) pageInput.value = this.currentPage;

        // 1. Identify current Surah based on page
        const currentSurah = [...this.surahs].reverse().find(s => s.page <= this.currentPage);

        const searchInputs = document.querySelectorAll('.surah-search-input');
        if (searchInputs.length && currentSurah) {
            const juzNum = engine.getJuzByPage(this.currentPage);
            const juzAr = this.toArabic(juzNum);
            searchInputs.forEach(input => input.placeholder = `${currentSurah.nameAr} (الجزء ${juzAr})`);
        }

        // 2. SILENT AUDIO SYNC
        // We update currentAudioSurahId so the "Stop/Play" logic knows what to fetch next,
        // but we do NOT call playAudio() or pauseAudio() here.
        if (currentSurah && currentSurah.id !== this.currentAudioSurahId) {

            // If playing → don't interrupt current recitation
            if (this.audioState === 'playing') {
                return;
            }

            // If paused → fully reset (user moved to new surah)
            if (this.audioState === 'paused') {
                this.stopAudio();
            }

            // Update to new surah
            this.currentAudioSurahId = currentSurah.id;
            this.isLoaded = false;

            // 🔥 Silent preload for faster playback
            this.preloadSurahAudio(currentSurah.id);
        }

        this.updateBookmarkPosition(rNum, lNum);
    },

    // --- Audio Functions ---
    async toggleAudio() {
        const currentSurah = [...this.surahs].reverse().find(
            s => s.page <= this.currentPage
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

        // 🔹 STOPPED → Play new surah (use preload if available)
        try {
            const btn = document.getElementById('playAudioBtn');
            const stpBtn = document.getElementById('stopAudioBtn');
            if (stpBtn) stpBtn.classList.add('opacity-50');;



            // ✅ Use preloaded audio instantly
            if (
                this.preloadedSurahId === currentSurah.id &&
                this.preloadedAudioUrl
            ) {
                this.audioPlayer.src = this.preloadedAudioUrl;
            } else {
                // 🔄 Fetch normally
                const res = await fetch(
                    `https://api.quran.com/api/v4/chapter_recitations/7/${currentSurah.id}`
                );
                const data = await res.json();

                if (!data.audio_file?.audio_url) {
                    throw new Error("No audio URL");
                }

                this.audioPlayer.src = data.audio_file.audio_url;
            }

            this.currentAudioSurahId = currentSurah.id;
            this.isLoaded = true;

            await this.audioPlayer.play();

            this.audioState = 'playing';
            this.isPlaying = true;

        } catch (e) {
            console.error("Audio load failed", e);
            alert("تعذر تحميل التلاوة.");
            this.audioState = 'stopped';
            this.isPlaying = false;
        }

        this.updateAudioUI();
    },// Play/Resume logic
    async playAudio() {
        if (!this.currentAudioSurahId) return;

        // If already loaded and NOT changed, just resume playback
        if (this.isLoaded && !this.isPlaying) {
            this.audioPlayer.play();
            this.isPlaying = true;
            this.updateAudioUI();
            return;
        }

        // Otherwise (if Stopped or Surah changed), fetch the new Surah
        try {
            const btn = document.getElementById('playAudioBtn');
            if (btn) btn.innerHTML = '⏳';

            const res = await fetch(`https://api.quran.com/api/v4/chapter_recitations/7/${this.currentAudioSurahId}`);
            const data = await res.json();

            if (data.audio_file?.audio_url) {
                this.audioPlayer.src = data.audio_file.audio_url;
                this.audioPlayer.load(); // Ensure the new source is buffered
                this.isLoaded = true;
                this.audioPlayer.play();
                this.isPlaying = true;
                this.updateAudioUI();
            }
        } catch (e) { console.error("Audio Load Error", e); }
    }, async preloadSurahAudio(surahId) {
        try {
            const res = await fetch(
                `https://api.quran.com/api/v4/chapter_recitations/7/${surahId}`
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
        if (this.currentPage !== savedPage) {
            this.currentPage = savedPage;
            this.render();
        }
    },

    changePage(dir) {
        const isMobile = window.innerWidth <= 768;
        const step = isMobile ? 1 : 2;

        if (this.activeMode === 'wird' && dir > 0) {
            // FIX: Check if the *viewed* pages include the target
            // On desktop, we view [Right: Even, Left: Odd]. Max viewed is the Odd number (Left side).
            let maxViewed = this.currentPage;
            if (!isMobile) {
                if (this.currentPage === 1) maxViewed = 1;
                else {
                    // If 2 or 3, max is 3 (the odd page on the left)
                    maxViewed = (this.currentPage % 2 === 0) ? this.currentPage + 1 : this.currentPage;
                }
            }

            if (maxViewed >= this.targetPage) {
                this.showCompletion();
                return;
            }
        }

        let nextVal = this.currentPage + (dir * step);

        // Fix: Allow going back to Page 1 from Page 2/3 (where nextVal might calculate to 0)
        if (nextVal < 1 && this.currentPage > 1) nextVal = 1;
        // Fix: Allow reaching 605 to show Page 604 on the right in dual view (Spread: [Empty | 604])
        if (nextVal > 605 || nextVal < 1) return;

        this.currentPage = nextVal;
        this.render();
    },

    saveBookmark(side) {
        let pageToSave = this.currentPage;
        if (window.innerWidth > 768) {
            if (this.currentPage === 1) {
                pageToSave = 1;
            } else {
                // Desktop Spread: [Left: Odd (lNum) | Right: Even (rNum)]
                const isEven = (this.currentPage % 2 === 0);
                const evenPage = isEven ? this.currentPage : this.currentPage - 1;
                const rNum = evenPage;     // Right Div has Even page
                const lNum = evenPage + 1; // Left Div has Odd page

                // If user clicks Right Page (Even) -> save rNum
                // If user clicks Left Page (Odd) -> save lNum
                pageToSave = (side === 'left') ? lNum : rNum;
            }
        }
        engine.updateProgress(pageToSave, (this.activeMode === 'free'));
        this.render();
    },

    updateBookmarkPosition(rNum, lNum) {
        const bookmark = document.getElementById('physicalBookmark');
        if (!bookmark) return;
        const currentSaved = this.activeMode === 'free' ? engine.state.freePage : engine.state.journey.current_page;
        bookmark.className = "";
        if (currentSaved === rNum || (window.innerWidth > 768 && lNum > 0 && currentSaved === lNum)) {
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
        const currentReader = parseInt(this.currentPage);

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

    // --- Audio Button Binding ---
    // Using class selectors to bind to both desktop and mobile controls
    document.querySelectorAll('.js-play-audio').forEach(btn => btn.addEventListener('click', () => Reader.toggleAudio()));
    document.querySelectorAll('.js-stop-audio').forEach(btn => btn.addEventListener('click', () => Reader.stopAudio()));
    document.querySelectorAll('.js-rewind-audio').forEach(btn => btn.addEventListener('click', () => Reader.rewindAudio()));
    document.querySelectorAll('.js-forward-audio').forEach(btn => btn.addEventListener('click', () => Reader.forwardAudio()));
    document.querySelectorAll('.js-prev-surah').forEach(btn => btn.addEventListener('click', () => Reader.prevSurah()));
    document.querySelectorAll('.js-next-surah').forEach(btn => btn.addEventListener('click', () => Reader.nextSurah()));

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