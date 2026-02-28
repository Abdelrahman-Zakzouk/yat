/**
 * Bayan | بيان - Unified Hadith Engine
 */
const HadithApp = {
    API: "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/",
    BOOKS: {
        "ara-bukhari": "صحيح البخاري",
        "ara-muslim": "صحيح مسلم",
    },
    current: null,
    mode: 'daily',
    isFavorited: false
};

/**
 * CORE DATA FETCHING
 */

// Fetch the "Pushed" settings from Supabase (Matches fetchDailyVerseKey logic)
async function fetchDailyHadithSettings() {
    try {
        const client = window.sbClient || window.sb || window.supabaseClient;
        if (!client) return { book_key: "ara-bukhari", hadith_number: "1" };

        const { data, error } = await client
            .from('site_config')
            .select('book_key, hadith_number')
            .eq('id', 'daily_hadith')
            .maybeSingle();

        return (error || !data) ? { book_key: "ara-bukhari", hadith_number: "1" } : data;
    } catch (e) {
        return { book_key: "ara-bukhari", hadith_number: "1" };
    }
}

async function fetchHadith(specificBook = null, specificNum = null) {
    const textEl = document.getElementById('hadithText');
    const metaEl = document.getElementById('hadithMeta');
    const bookSelect = document.getElementById('bookSelect');

    if (!textEl || !metaEl) return;

    // Transition UI Out
    textEl.classList.remove('opacity-100', 'translate-y-0');
    textEl.classList.add('opacity-0', 'translate-y-4');

    try {
        let bookId = specificBook || bookSelect?.value || "ara-bukhari";
        let hadithNum = specificNum;

        // Daily Mode Logic
        if (HadithApp.mode === 'daily' && !specificNum && !specificBook) {
            const config = await fetchDailyHadithSettings();
            if (config?.book_key) {
                bookId = config.book_key;
                hadithNum = config.hadith_number;
                if (bookSelect) bookSelect.value = bookId;
            }
        }

        // Fetching with .min.json for Muslim
        const isMuslim = bookId === "ara-muslim";
        const res = await fetch(`${HadithApp.API}${bookId}${isMuslim ? '.min' : ''}.json`);
        const data = await res.json();

        // --- CRITICAL FIX: DATA VALIDATION ---
        if (!data.hadiths || data.hadiths.length === 0) {
            throw new Error("No hadiths found in data");
        }

        let entry;
        if (hadithNum) {
            // Find specific hadith, fallback to first one if not found
            entry = data.hadiths.find(h => String(h.hadithnumber) == String(hadithNum));
            if (!entry) entry = data.hadiths[0];
        } else {
            // Random selection
            const index = Math.floor(Math.random() * data.hadiths.length);
            entry = data.hadiths[index];
        }

        // --- CRITICAL FIX: KEY MAPPING ---
        // Some editions use .text, others use .hadith
        const finalContent = entry.text || entry.hadith || "لم يتم العثور على نص الحديث";

        HadithApp.current = {
            text: finalContent,
            number: entry.hadithnumber,
            book: HadithApp.BOOKS[bookId] || "كتاب غير معروف",
            book_key: bookId
        };

        // Update UI inside the transition timer
        setTimeout(() => {
            textEl.innerText = HadithApp.current.text;
            metaEl.innerText = `${HadithApp.current.book} • رقم ${HadithApp.current.number}`;

            textEl.style.lineHeight = "2.8";
            textEl.classList.remove('opacity-0', 'translate-y-4');
            textEl.classList.add('opacity-100', 'translate-y-0');
            updateFavoriteUI();
        }, 400);

    } catch (err) {
        console.error("Fetch Error:", err);
        textEl.innerText = "⚠️ تعذر تحميل الحديث. حاول مرة أخرى.";
        textEl.classList.remove('opacity-0');
    }
}

async function setAppMode(mode) {
    HadithApp.mode = mode;
    const bg = document.getElementById('toggleBg');

    // UI Toggle Visuals
    if (bg) {
        bg.style.transform = (mode === 'daily') ? 'translateX(0)' : 'translateX(-100%)';
    }

    const dailyBtn = document.getElementById('mode-daily');
    const randomBtn = document.getElementById('mode-random');
    if (mode === 'daily') {
        dailyBtn?.classList.replace('text-slate-400', 'text-white');
        randomBtn?.classList.replace('text-white', 'text-slate-400');

        const config = await fetchDailyHadithSettings();
        fetchHadith(config.book_key, config.hadith_number);
    } else {
        randomBtn?.classList.replace('text-slate-400', 'text-white');
        dailyBtn?.classList.replace('text-white', 'text-slate-400');
        fetchHadith(); // Random
    }
}

/**
 * APP FLOW & MODES
 */


/**
 * FAVORITES (DATABASE) LOGIC
 */
async function updateFavoriteUI() {
    if (!HadithApp.current) return;
    const btn = document.getElementById('favoriteBtn');
    if (!btn) return;

    try {
        const client = window.sbClient || window.sb || window.supabaseClient;
        if (!client) return;

        const { data: { user } } = await client.auth.getUser();
        if (!user) {
            HadithApp.isFavorited = false;
            updateFavoriteButton();
            return;
        }

        const { data, error } = await client
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('hadith_number', HadithApp.current.number)
            .eq('book_key', HadithApp.current.book_key)
            .maybeSingle();

        HadithApp.isFavorited = !!data;
        updateFavoriteButton();
    } catch (e) {
        console.warn('UI State Error:', e);
    }
}

function updateFavoriteButton() {
    const btn = document.getElementById('favoriteBtn');
    const icon = document.getElementById('favoriteIcon');
    const text = document.getElementById('favoriteBtnText');
    if (!btn || !icon || !text) return;

    if (HadithApp.isFavorited) {
        btn.classList.replace('bg-red-500/10', 'bg-red-500/30');
        icon.setAttribute('name', 'heart');
        text.innerText = 'محفوظ';
    } else {
        btn.classList.replace('bg-red-500/30', 'bg-red-500/10');
        icon.setAttribute('name', 'heart-outline');
        text.innerText = 'حفظ';
    }
}

async function toggleFavorite() {
    if (!HadithApp.current) return;

    try {
        const client = window.sbClient || window.sb || window.supabaseClient;
        const { data: { user } } = await client.auth.getUser();

        if (!user) {
            showToast('⚠️ يجب تسجيل الدخول أولاً');
            return;
        }

        if (HadithApp.isFavorited) {
            await client.from('favorites').delete()
                .eq('user_id', user.id)
                .eq('hadith_number', HadithApp.current.number)
                .eq('book_key', HadithApp.current.book_key);
            HadithApp.isFavorited = false;
            showToast('❌ تم الإزالة من المفضلة');
        } else {
            await client.from('favorites').insert([{
                user_id: user.id,
                hadith_number: HadithApp.current.number,
                book_key: HadithApp.current.book_key,
                hadith_text: HadithApp.current.text
            }]);
            HadithApp.isFavorited = true;
            showToast('✅ تم الحفظ في المفضلة');
        }
        updateFavoriteButton();
    } catch (e) {
        showToast('❌ حدث خطأ في النظام');
    }
}

/**
 * IMAGE GENERATION & SHARING
 */
async function shareAsImage() {
    if (!HadithApp.current) return;
    const canvas = document.getElementById('shareCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1080; canvas.height = 1080;

    const grad = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
    grad.addColorStop(0, '#152422'); grad.addColorStop(1, '#0b1211');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 10; ctx.strokeRect(40, 40, 1000, 1000);

    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillStyle = '#2dd4bf';
    ctx.font = '40px "Amiri", serif';
    ctx.fillText(`${HadithApp.current.book} | رقم ${HadithApp.current.number}`, 540, 120);

    ctx.fillStyle = 'white';
    let fontSize = 60;
    ctx.font = `bold ${fontSize}px "Amiri", serif`;
    let words = HadithApp.current.text.split(' '), lines = [], line = '';
    words.forEach(w => {
        if (ctx.measureText(line + w).width > 850) { lines.push(line); line = w + ' '; }
        else { line += w + ' '; }
    });
    lines.push(line);

    while (lines.length * fontSize * 1.5 > 700) {
        fontSize -= 5;
        ctx.font = `bold ${fontSize}px "Amiri", serif`;
        // Recalculate lines with smaller font...
    }

    let y = 540 - (lines.length * fontSize * 0.7);
    lines.forEach(l => { ctx.fillText(l.trim(), 540, y); y += fontSize * 1.5; });

    ctx.fillStyle = '#2dd4bf';
    ctx.font = '30px "Rakkas", serif';
    ctx.fillText('تطبيق بيان | Bayan Hadith', 540, 1030);

    document.getElementById('previewImage').src = canvas.toDataURL();
    toggleModal('shareModal', true);
}

function copyToClipboard() {
    if (!HadithApp.current) return;
    const msg = `﴿ حديث شريف ﴾\n\n${HadithApp.current.text}\n\nالمصدر: ${HadithApp.current.book}\nعبر تطبيق بيان`;
    navigator.clipboard.writeText(msg).then(() => showToast("✅ تم نسخ نص الحديث"));
}

/**
 * MODAL & UI HELPERS
 */
function toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
}

function showToast(m) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    if (!t || !msgEl) return;
    msgEl.innerText = m;
    t.classList.replace('opacity-0', 'opacity-100');
    setTimeout(() => t.classList.replace('opacity-100', 'opacity-0'), 3000);
}

// --- INITIALIZATION (Fixes the "Hadith 1" on launch issue) ---
async function startApp() {
    // 1. Initial wait for Supabase if needed
    try { if (window.getSupabaseClient) await window.getSupabaseClient(); } catch (e) { }

    // 2. Load settings and fetch
    const config = await fetchDailyHadithSettings();
    fetchHadith(config.book_key, config.hadith_number);
}

window.onload = startApp;