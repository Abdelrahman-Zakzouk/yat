/**
 * Bayan | Global Logic & Analytics
 * Handles: Supabase Init, Unique Visit Tracking, Real-time Presence, and UI Helpers.
 */

// 1. SUPABASE INITIALIZATION (The foundation for all pages)
const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';

// Helper: dynamically load a script and resolve when loaded or reject on error
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
    });
}

// Ensure Supabase client is available and expose canonical globals used across the app.
async function ensureSupabaseClient() {
    try {
        // If the global `supabase` lib isn't available, load the UMD bundle from CDN
        if (typeof window.supabase === 'undefined') {
            // Try a local UMD copy first (recommended for production builds)
            try {
                await loadScript('/build/js/vendor/supabase.umd.min.js');
            } catch (localErr) {
                // Fallback to CDN if local file not present or fails
                await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js');
            }
        }

        // Create client and expose multiple aliases to be safe
        if (typeof window.supabase !== 'undefined' && !window.sb) {
            window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.sbClient = window.sb; // backward compatibility
            window.supabaseClient = window.sb; // explicit alias
            // Also ensure HadithEngine.sb is set for modules relying on it
            window.HadithEngine = window.HadithEngine || {};
            window.HadithEngine.sb = window.sb;
        }
    } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
    }
}

// Start ensuring the client immediately
ensureSupabaseClient();

// Promise-based accessor: resolves with `window.sb` when ready
window.getSupabaseClient = function (timeout = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (window.sb) return resolve(window.sb);
            if (Date.now() - start > timeout) return reject(new Error('Supabase client not available'));
            setTimeout(check, 100);
        };
        check();
    });
};

// Shared Constants
window.HadithEngine = window.HadithEngine || {};
window.HadithEngine.sb = window.sb;
window.HadithEngine.BOOKS = {
    'ara-bukhari': 'صحيح البخاري',
    'ara-muslim': 'صحيح مسلم',
};

const BayanGlobal = {
    sb: window.sb,
    presenceChannel: null,

    /**
     * Initialize global services
     */
    async init() {
        try {
            await window.getSupabaseClient();
            this.sb = window.sb;

            // ... your other init logic (trackVisit, etc) ...

            this.initPresence(); // Start the live tracker
            console.log("🌙 Bayan Global: Online");
        } catch (e) { console.error("Init Error:", e); }
    },

    async initPresence() {
        try {
            const { data: { user } } = await this.sb.auth.getUser();
            // Unique ID per session/tab to ensure accurate live counting
            const visitorId = user ? `u_${user.id}_${Math.random().toString(36).substring(2, 5)}` : `g_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

            this.presenceChannel = this.sb.channel('online-users', {
                config: { presence: { key: visitorId } }
            });

            // Sync event fires whenever someone joins or leaves
            this.presenceChannel.on('presence', { event: 'sync' }, () => {
                const newState = this.presenceChannel.presenceState();
                this.onlineCount = Object.keys(newState).length;
                this.updateLiveUI();
            });

            this.presenceChannel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceChannel.track({
                        online_at: new Date().toISOString(),
                        page: window.location.pathname
                    });
                }
            });
        } catch (e) { console.error("Presence Error:", e); }
    },

    updateLiveUI() {
        // Updates all elements with class 'live-users-count'
        const countElements = document.querySelectorAll('.live-users-count');
        countElements.forEach(el => {
            el.innerText = this.onlineCount;
        });

        // Optional: toggle a pulse animation on a status dot
        const dot = document.getElementById('live-status-dot');
        if (dot) {
            dot.classList.add('animate-pulse');
            setTimeout(() => dot.classList.remove('animate-pulse'), 500);
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


// KHATMA SYNC HELPERS
async function syncKhatmaCacheWithServer() {
    try {
        if (!window.sb) return;
        const { data: { user } } = await window.sb.auth.getUser();
        if (!user) return;

        const { data, error } = await window.sb
            .from('khatma_progress')
            .select('last_verse_key,last_page,start_date,end_date')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            console.warn('syncKhatmaCacheWithServer error', error);
            return;
        }

        if (data) {
            let page = 1;
            if (data.last_verse_key && data.last_verse_key.startsWith('page:')) {
                const p = parseInt(data.last_verse_key.split(':')[1]);
                if (!isNaN(p)) page = p;
            } else if (data.last_page) {
                const p = parseInt(data.last_page);
                if (!isNaN(p)) page = p;
            }
            const journey = {
                id: 'srv_' + Date.now(),
                current_page: page,
                start_date: data.start_date || new Date().toISOString(),
                end_date: data.end_date || data.start_date || new Date().toISOString(),
                mode: 'wird'
            };
            console.log('[Global] syncing khatma cache with server', journey);
            localStorage.setItem('Bayan_khatma_cache', JSON.stringify(journey));
        }
    } catch (e) {
        console.warn('syncKhatmaCacheWithServer failed', e);
    }
}

// UI FUNCTIONS

function renderIndex() {
    const grid = document.getElementById('indexGrid');
    if (!grid) return;
    const query = document.getElementById('indexSearch')?.value.toLowerCase() || "";
    if (typeof allSurahs === 'undefined') return;

    const filtered = allSurahs.filter(s => s.name_arabic.includes(query) || s.id.toString() === query);
    grid.innerHTML = filtered.map(s => `
        <div onclick="selectFromIndex(${s.id})" class="bg-[#162927] border border-teal-900/50 p-3 rounded-xl text-center cursor-pointer hover:border-teal-400">
            <h3 class="text-base font-bold quran-font text-white">${s.name_arabic}</h3>
            <p class="text-[9px] text-slate-500 uppercase">${s.name_simple}</p>
        </div>`).join('');
}

function renderHadithIndex() {
    const grid = document.getElementById('indexHadithGrid');
    if (!grid) return;
    const query = document.getElementById('indexSearch')?.value.toLowerCase() || "";
    if (typeof allHadiths === 'undefined') return;

    const filtered = allHadiths.filter(h => h.name_arabic.includes(query) || h.id.toString() === query);
    grid.innerHTML = filtered.map(h => `
        <div onclick="selectFromIndex(${h.id})" class="bg-[#162927] border border-teal-900/50 p-3 rounded-xl text-center cursor-pointer hover:border-teal-400">
            <h3 class="text-base font-bold quran-font text-white">${h.name_arabic}</h3>
            <p class="text-[9px] text-slate-500 uppercase">${h.name_simple || ''}</p>
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
    window.location.href = `/build/html/khatma.html?surah=${surahId}`;
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
            .select('last_verse_key, last_page')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (data) {
            const widget = document.getElementById('resumeWidget');
            const text = document.getElementById('resumeStatusText');
            if (widget && text) {
                widget.classList.remove('hidden');
                if (data.last_verse_key && data.last_verse_key.startsWith('page:')) {
                    const p = parseInt(data.last_verse_key.split(':')[1]);
                    text.innerText = `وصلت إلى صفحة ${p}`;
                } else if (data.last_page) {
                    text.innerText = `وصلت إلى صفحة ${data.last_page}`;
                } else if (data.last_verse_key) {
                    const [sNum] = data.last_verse_key.split(':');
                    let surahName = '';
                    if (typeof allSurahs !== 'undefined') {
                        const surah = allSurahs.find(s => s.id == sNum);
                        surahName = surah ? surah.name_arabic : '';
                    }
                    text.innerText = `وصلت إلى سورة ${surahName} (${data.last_verse_key})`;
                }
            }
        }
    } catch (e) { console.error("Khatma Widget Error:", e); }
}


if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Bayan PWA Active'))
            .catch(err => console.log('PWA Setup Failed', err));
    });
}

// Custom Install Prompt logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // You can now show a "Download App" button in your UI
    console.log("App is ready to be installed");
});

const pwaBanner = document.getElementById('pwa-banner');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    // Check if the user has dismissed it recently
    if (!localStorage.getItem('pwa-dismissed')) {
        pwaBanner.classList.remove('hidden');
        pwaBanner.classList.add('flex', 'animate-bounce-subtle');
    }
});

async function installPWA() {
    // Add this safety check
    if (!deferredPrompt || typeof deferredPrompt.prompt !== 'function') {
        console.log("Native prompt not ready yet. Please wait for the browser to trigger it.");
        alert("المتصفح يجهز عملية التثبيت، يرجى المحاولة بعد قليل.");
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    pwaBanner.classList.add('hidden');
}
function dismissPWA() {
    pwaBanner.classList.add('hidden');
    // Don't show it again for 7 days
    localStorage.setItem('pwa-dismissed', Date.now());
}

// Check if app is already launched in standalone mode
if (window.matchMedia('(display-mode: standalone)').matches) {
    pwaBanner?.classList.add('hidden');
}


// AUTO-BOOTSTRAP
document.addEventListener('DOMContentLoaded', () => {
    BayanGlobal.init();
});