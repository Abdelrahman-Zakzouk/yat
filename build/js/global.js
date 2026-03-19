/**
 * Bayani | Global Logic & Analytics
 * Handles: Supabase Init, Unique Visit Tracking, Real-time Presence, and UI Helpers.
 */

// 1. SUPABASE INITIALIZATION (The foundation for all pages)
const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';


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
        if (typeof window.supabase === 'undefined') {
            try {
                await loadScript('/build/js/vendor/supabase.umd.min.js');
            } catch (localErr) {
                await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js');
            }
        }

        // Standardize the global variable
        if (typeof window.supabase !== 'undefined' && !window.sb) {
            // Explicitly set window.supabase to the initialized client
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabase = client; // <--- This fixes the ReferenceError
            window.sb = client;
            window.sbClient = client;

            window.HadithEngine = window.HadithEngine || {};
            window.HadithEngine.sb = client;
        }
    } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
    }
}

// Start ensuring the client immediately
ensureSupabaseClient();

// 2. VERCEL WEB ANALYTICS (works on Vercel deployments)
function initVercelAnalytics() {
    try {
        const host = window.location.hostname || '';
        const isLocal = host === 'localhost'
            || host === '127.0.0.1'
            || host === '0.0.0.0'
            || host.endsWith('.local');

        // Avoid local 404 noise and duplicate injections
        if (isLocal) return;
        if (document.querySelector('script[data-bayani-vercel-analytics="1"]')) return;

        const script = document.createElement('script');
        script.src = '/_vercel/insights/script.js';
        script.defer = true;
        script.setAttribute('data-bayani-vercel-analytics', '1');
        document.head.appendChild(script);
    } catch (e) {
        console.warn('Vercel Analytics init skipped:', e);
    }
}

initVercelAnalytics();

// Promise-based accessor: resolves with `window.sb` when ready


// Shared Constants
window.HadithEngine = window.HadithEngine || {};
window.HadithEngine.sb = window.sb;
window.HadithEngine.BOOKS = {
    'ara-bukhari': 'صحيح البخاري',
    'ara-muslim': 'صحيح مسلم',
};

const BayaniGlobal = {
    sb: window.sb,
    presenceChannel: null,
    onlineCount: 0,

    getDeviceInfo() {
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || 'unknown';

        let browser = 'Unknown';
        if (/edg\//i.test(ua)) browser = 'Edge';
        else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
        else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';
        else if (/firefox\//i.test(ua)) browser = 'Firefox';

        let deviceModel = 'Desktop';
        if (/iphone/i.test(ua)) deviceModel = 'iPhone';
        else if (/ipad/i.test(ua)) deviceModel = 'iPad';
        else if (/android/i.test(ua)) {
            // Try extracting Android model, e.g. "SM-S918B" from:
            // Mozilla/... (Linux; Android 14; SM-S918B Build/...) ...
            const m = ua.match(/Android\s+[\d.]+;\s*([^;\)]+?)(?:\s+Build\/|\))/i);
            let candidate = (m && m[1] ? m[1].trim() : 'Android');
            candidate = candidate.replace(/\b(wv|u|linux)\b/ig, '').trim();
            if (!candidate || candidate.length < 3) candidate = 'Android';
            deviceModel = candidate;
        }
        else if (/windows/i.test(platform)) deviceModel = 'Windows PC';
        else if (/mac/i.test(platform)) deviceModel = 'Mac';
        else if (/linux/i.test(platform)) deviceModel = 'Linux PC';

        return {
            userAgent: ua,
            platform,
            browser,
            deviceModel,
            deviceName: `${deviceModel} (${browser})`
        };
    },

    async buildVisitorIdentifier() {
        // DB-first unique id: stable hardware/browser fingerprint only.
        // This keeps the same visitor_id across normal/incognito on same device
        // (as long as fingerprint signals are unchanged).
        const fp = await this.generateFingerprint();
        return `dev_${fp}`;
    },

    async buildStableKey() {
        const fp = await this.generateFingerprint();
        return `stb_${fp}`;
    },

    async buildVisitStableKey(user) {
        if (user?.id) return `usr_${user.id}`;
        return this.buildStableKey();
    },

    /**
     * Initialize global services
     */
    async init() {
        try {
            await window.getSupabaseClient();
            this.sb = window.sb;

            // Track unique visit (guest fingerprint or authenticated user id)
            await this.trackVisit();

            this.initPresence(); // Start the live tracker
            console.log("🌙 Bayani Global: Online");
        } catch (e) { console.error("Init Error:", e); }
    },

    async initPresence() {
        try {
            const { data: { user } } = await this.sb.auth.getUser();
            // Stable presence key: same person/device should not inflate active count across tabs.
            const stableKey = await this.buildStableKey();
            const presenceKey = user ? `u_${user.id}` : `g_${stableKey}`;

            this.presenceChannel = this.sb.channel('online-users', {
                config: { presence: { key: presenceKey } }
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
                        page: window.location.pathname,
                        stable_key: stableKey
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
            const {
                data: { user }
            } = await this.sb.auth.getUser();
            const deviceStableKey = await this.buildStableKey();
            const visitStableKey = await this.buildVisitStableKey(user);
            const device = this.getDeviceInfo();

            // Unified server-side analytics write (visit + metadata) for reliability.
            const { error: analyticsErr } = await this.sb.rpc('increment_visit_count_unique_v2', {
                visitor_identifier: visitStableKey,
                p_device_visitor_id: deviceStableKey,
                p_user_id: user?.id || null,
                p_email: user?.email || null,
                p_device_name: device.deviceName,
                p_device_model: device.deviceModel,
                p_browser: device.browser,
                p_platform: device.platform,
                p_user_agent: device.userAgent,
                p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
            });

            if (analyticsErr) {
                console.warn('increment_visit_count_unique_v2 failed:', analyticsErr);
            }

            // Useful for manual checks/debugging in browser console
            window.BayaniVisitorIdentifier = visitStableKey;
            window.BayaniDeviceIdentifier = deviceStableKey;
        } catch (e) {
            console.error("Tracking Failure:", e);
        }
    },

    async generateFingerprint() {
        const stableSignals = [
            navigator.userAgent || 'ua_ukn',
            navigator.platform || 'plt_ukn',
            navigator.language || 'lang_ukn',
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'tz_ukn'
        ].join('|');

        // Primary path: Web Crypto SHA-256
        try {
            if (window.crypto?.subtle && typeof TextEncoder !== 'undefined') {
                const encoder = new TextEncoder();
                const data = encoder.encode(stableSignals);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
            }
        } catch (e) {
            console.warn('Fingerprint crypto path failed, using fallback hash:', e);
        }

        // Fallback path for older/mobile webviews without subtle crypto
        let h1 = 5381;
        let h2 = 52711;
        for (let i = 0; i < stableSignals.length; i++) {
            const c = stableSignals.charCodeAt(i);
            h1 = ((h1 << 5) + h1) ^ c;
            h2 = ((h2 << 5) + h2) ^ (c * 33);
        }
        const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
        const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
        const raw = `${p1}${p2}${p1}${p2}`;
        return raw.substring(0, 32);
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
            localStorage.setItem('Bayani_khatma_cache', JSON.stringify(journey));
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
            .select('last_verse_key, last_page, current_page')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (data) {
            const widget = document.getElementById('resumeWidget');
            const text = document.getElementById('resumeStatusText');
            if (widget && text) {
                widget.classList.remove('hidden');
                // Helper function to convert numbers to Arabic numerals
                const toArabicNum = (n) => n.toString().replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
                
                // Prioritize current_page for most accurate display
                const pageNum = data.current_page || data.last_page;
                if (pageNum) {
                    text.innerText = `وصلت إلى صفحة ${toArabicNum(pageNum)}`;
                } else if (data.last_verse_key && data.last_verse_key.startsWith('page:')) {
                    const p = parseInt(data.last_verse_key.split(':')[1]);
                    text.innerText = `وصلت إلى صفحة ${toArabicNum(p)}`;
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
            .then(reg => console.log('Bayani PWA Active'))
            .catch(err => console.log('PWA Setup Failed', err));
    });
}

// Custom Install Prompt logic
// 1. Declare the variable but don't assign the DOM element yet
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default browser mini-infobar from appearing
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    console.log("App is ready to be installed");

    // 2. NOW find the element and show it safely
    const pwaBanner = document.getElementById('pwa-banner');
    if (pwaBanner && !localStorage.getItem('pwa-dismissed')) {
        pwaBanner.classList.remove('hidden');
        pwaBanner.classList.add('flex', 'animate-bounce-subtle');
    }
});

async function installPWA() {
    const pwaBanner = document.getElementById('pwa-banner'); // Find it when needed

    if (!deferredPrompt) {
        console.log("Install prompt not available.");
        return;
    }

    // Show the native prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again
    deferredPrompt = null;

    if (pwaBanner) pwaBanner.classList.add('hidden');
}

function dismissPWA() {
    const pwaBanner = document.getElementById('pwa-banner');
    if (pwaBanner) pwaBanner.classList.add('hidden');
    // Don't show it again for 7 days (Logic: Date.now() is truthy)
    localStorage.setItem('pwa-dismissed', Date.now());
}

// Check if app is already launched in standalone mode
if (window.matchMedia('(display-mode: standalone)').matches) {
    const pwaBannerEl = document.getElementById('pwa-banner');
    pwaBannerEl?.classList.add('hidden');
}


// AUTO-BOOTSTRAP
document.addEventListener('DOMContentLoaded', () => {
    BayaniGlobal.init();
});