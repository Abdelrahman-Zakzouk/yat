/**
 * Yatlo | Global Logic & Analytics
 * Handles: Supabase Init, Unique Visit Tracking, Real-time Presence, and UI Helpers.
 */

// 1. SUPABASE INITIALIZATION (The foundation for all pages)
const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';

// Initialize and expose to window so other scripts (profile.js, hadiths.js) can see them
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.sbClient = window.sb; // Support both naming conventions used in your code

// Shared Constants
window.HadithEngine = window.HadithEngine || {};
window.HadithEngine.sb = window.sb;
window.HadithEngine.BOOKS = {
    'ara-bukhari': 'صحيح البخاري',
    'ara-muslim': 'صحيح مسلم',
    'ara-nasai': 'سنن النسائي',
    'ara-abudawud': 'سنن أبي داود',
    'ara-tirmidhi': 'جامع الترمذي',
    'ara-ibnmajah': 'سنن ابن ماجه'
};

const YatloGlobal = {
    sb: window.sb,
    presenceChannel: null,

    /**
     * Initialize global services
     */
    async init() {
        // 1. Run hardware-based unique visit tracking
        this.trackVisit();

        // 2. Initialize real-time presence tracking
        this.initPresence();

        // 3. Check for active Khatma progress
        checkActiveKhatma();

        console.log("🌙 Yatlo Global Services: Online");
    },

    /**
     * REAL-TIME PRESENCE (Active Users)
     */
    async initPresence() {
        try {
            const { data: { user } } = await this.sb.auth.getUser();
            const visitorId = user ? `u_${user.id}` : `g_${Math.random().toString(36).substring(2, 9)}`;

            this.presenceChannel = this.sb.channel('online-users', {
                config: { presence: { key: visitorId } }
            });

            this.presenceChannel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceChannel.track({
                        online_at: new Date().toISOString(),
                        page: window.location.pathname,
                        platform: navigator.platform
                    });
                }
            });
        } catch (e) {
            console.error("Presence Error:", e);
        }
    },

    /**
     * UNIQUE VISIT TRACKING
     */
    async trackVisit() {
        try {
            const { data: { user } } = await this.sb.auth.getUser();
            let visitorId = user ? `u_${user.id}` : `f_${await this.generateFingerprint()}`;

            await this.sb.rpc('increment_visit_count_unique', {
                visitor_identifier: visitorId
            });
        } catch (e) {
            console.error("Tracking Failure:", e);
        }
    },

    async generateFingerprint() {
        const hardwareInfo = [
            navigator.hardwareConcurrency,
            navigator.deviceMemory || "ukn",
            screen.width + "x" + screen.height,
            new Date().getTimezoneOffset(),
            navigator.platform
        ].join('|');

        const encoder = new TextEncoder();
        const data = encoder.encode(hardwareInfo);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    }
};

// UI FUNCTIONS
function renderIndex() {
    const grid = document.getElementById('indexGrid');
    if (!grid) return;
    const query = document.getElementById('indexSearch')?.value.toLowerCase() || "";
    // Assumes allSurahs is defined in another script or globally
    if (typeof allSurahs === 'undefined') return;

    const filtered = allSurahs.filter(s => s.name_arabic.includes(query) || s.id.toString() === query);
    grid.innerHTML = filtered.map(s => `
        <div onclick="selectFromIndex(${s.id})" class="bg-[#162927] border border-teal-900/50 p-3 rounded-xl text-center cursor-pointer hover:border-teal-400">
            <h3 class="text-base font-bold quran-font text-white">${s.name_arabic}</h3>
            <p class="text-[9px] text-slate-500 uppercase">${s.name_simple}</p>
        </div>`).join('');
}

function openIndex() {
    const modal = document.getElementById('indexModal');
    if (!modal) return;
    modal.classList.replace('hidden', 'flex');
    setTimeout(() => modal.classList.add('active'), 10);
    renderIndex();
}

function closeIndex() {
    const modal = document.getElementById('indexModal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => modal.classList.replace('flex', 'hidden'), 300);
}

function selectFromIndex(surahId) {
    window.location.href = `/build/html/surah.html?surah=${surahId}`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.replace('opacity-0', 'opacity-100');
    setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

async function checkActiveKhatma() {
    try {
        const { data: { user } } = await window.sb.auth.getUser();
        if (!user) return;

        const { data } = await window.sb
            .from('khatma_progress')
            .select('last_verse_key')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (data && typeof allSurahs !== 'undefined') {
            const widget = document.getElementById('resumeWidget');
            const text = document.getElementById('resumeStatusText');
            if (widget && text) {
                widget.classList.remove('hidden');
                const [sNum] = data.last_verse_key.split(':');
                const surah = allSurahs.find(s => s.id == sNum);
                text.innerText = `وصلت إلى سورة ${surah ? surah.name_arabic : ''} (${data.last_verse_key})`;
            }
        }
    } catch (e) { console.error("Khatma Widget Error:", e); }
}

// AUTO-BOOTSTRAP
document.addEventListener('DOMContentLoaded', () => {
    YatloGlobal.init();
});