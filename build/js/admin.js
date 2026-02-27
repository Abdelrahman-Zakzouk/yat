/**
 * يتلو | Yatlo Admin - Unified Logic
 * Handles: Security, Real-time Stats, Daily Verse & Hadith Management
 */

// --- CONFIGURATION ---
const SUPABASE_URL = "https://ruokjdtnpraaglmewjwa.supabase.co";
const SUPABASE_KEY = "sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL STATE ---
let allSurahs = [];
let selectedSurahId = null;
let confirmedKey = null;
let activeSearchIndex = -1;
let adminMode = 'quran';
let presenceChannel; // Global to prevent garbage collection

/**
 * 1. SECURITY & INITIALIZATION
 */
async function checkAdminAccess() {
    try {
        const { data: { user } } = await sb.auth.getUser();

        if (!user) {
            window.location.href = '/build/html/auth.html';
            return;
        }

        const { data: profile, error } = await sb
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (error || !profile?.is_admin) {
            alert("⚠️ غير مصرح لك بدخول هذه الصفحة");
            window.location.href = '/build/html/profile.html';
        } else {
            // Success: Reveal Admin UI
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';

            const adminContent = document.getElementById('adminContent');
            if (adminContent) adminContent.classList.remove('hidden');

            // Load Data & Start Real-time Streams
            fetchInitialData();
            initStatsTracking();
        }
    } catch (err) {
        console.error("Security Check Failed:", err);
    }
}

async function fetchInitialData() {
    try {
        const res = await fetch('https://api.quran.com/api/v4/chapters?language=en');
        const data = await res.json();
        allSurahs = data.chapters;

        const { data: configs, error } = await sb.from('site_config').select('*');
        if (error) throw error;

        const verseConfig = configs.find(c => c.id === 'daily_verse');
        const hadithConfig = configs.find(c => c.id === 'daily_hadith');

        if (verseConfig) document.getElementById('liveVerse').innerText = verseConfig.verse_key;
        if (hadithConfig) document.getElementById('liveHadith').innerText = `${hadithConfig.book_key} #${hadithConfig.hadith_number}`;

        setTimeout(() => {
            const verseInput = document.getElementById('newVerseKey');
            if (verseInput) verseInput.focus();
        }, 100);
    } catch (e) {
        showStatus("⚠️ خطأ في الاتصال: " + e.message, "text-orange-400");
    }
}

/**
 * 2. REAL-TIME STATS LOGIC
 */
async function initStatsTracking() {
    // Presence (Active Users) - Must match channel name in script.js
    presenceChannel = sb.channel('online-users');

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const count = Object.keys(state).length;
            const activeEl = document.getElementById('activeUsersCount');
            if (activeEl) {
                activeEl.innerText = count;
                console.log("Admin Panel Sync: Online Users =", count);
            }
        })
        .subscribe();

    // Total Visits Fetch
    fetchTotalVisits();
}

async function fetchTotalVisits() {
    try {
        const { data } = await sb.from('site_stats').select('count').eq('id', 'total_visits').single();
        if (data) {
            const totalEl = document.getElementById('totalVisitsCount');
            if (totalEl) totalEl.innerText = data.count.toLocaleString();
        }
    } catch (e) {
        console.error("Failed to fetch visits:", e);
    }
}

/**
 * 3. MODE SWITCHING & UI
 */
function switchAdminMode(mode) {
    adminMode = mode;
    const qBtn = document.getElementById('quranTabBtn');
    const hBtn = document.getElementById('hadithTabBtn');
    const qArea = document.getElementById('quranInputArea');
    const hArea = document.getElementById('hadithInputArea');
    const title = document.getElementById('adminTitle');
    const live = document.getElementById('liveIndicator');
    const card = document.getElementById('previewCard');
    const btnText = document.getElementById('btnText');

    card?.classList.add('hidden');
    const noteField = document.getElementById('verseNote');
    if (noteField) noteField.value = "";

    if (mode === 'quran') {
        qBtn?.classList.add('bg-teal-600', 'text-white');
        hBtn?.classList.remove('bg-teal-600', 'text-white');
        qArea?.classList.remove('hidden');
        hArea?.classList.add('hidden');
        if (title) title.innerText = "بث آية اليوم";
        if (live) live.style.visibility = "visible";
        if (btnText) btnText.innerText = "تأكيد وبث التحديث";
    } else {
        hBtn?.classList.add('bg-teal-600', 'text-white');
        qBtn?.classList.remove('bg-teal-600', 'text-white');
        hArea?.classList.remove('hidden');
        qArea?.classList.add('hidden');
        if (title) title.innerText = "هدايات الأحاديث";
        if (live) live.style.visibility = "hidden";
        if (btnText) btnText.innerText = "حفظ هداية الحديث";

        document.getElementById('previewName').innerText = "إضافة هداية لحديث";
        document.getElementById('previewText').innerText = "أدخل رقم الحديث واختر الكتاب لحفظ الدرس المستفاد";
        card?.classList.remove('hidden');
    }
}

/**
 * 4. QURAN SEARCH & PREVIEW
 */
async function unifiedAdminLogic() {
    if (adminMode !== 'quran') return;
    const inputField = document.getElementById('newVerseKey');
    const inputVal = inputField.value.trim().toLowerCase();
    const list = document.getElementById('adminSearchList');
    const card = document.getElementById('previewCard');

    activeSearchIndex = -1;

    try {
        if (/^\d+:\d+$/.test(inputVal)) {
            list.classList.add('hidden');
            await showVersePreview(inputVal);
            return;
        }

        if (inputVal.includes(':') && selectedSurahId) {
            const ayah = inputVal.split(':')[1].trim();
            if (ayah.length > 0) {
                list.classList.add('hidden');
                await showVersePreview(`${selectedSurahId}:${ayah}`);
            }
            return;
        }

        card?.classList.add('hidden');
        if (inputVal.length > 0) {
            const matches = allSurahs.filter(s =>
                s.name_arabic.includes(inputVal) ||
                s.name_simple.toLowerCase().includes(inputVal)
            ).slice(0, 5);

            if (matches.length > 0) {
                list.innerHTML = matches.map(s => `
                    <div onclick="applySelection('${s.name_arabic}', ${s.id})" class="p-4 cursor-pointer border-b border-white/5 text-right flex justify-between items-center hover:bg-teal-900/20 transition-colors">
                        <span class="text-teal-600 text-[10px] font-bold">#${s.id}</span>
                        <div class="flex flex-col items-end">
                            <span class="text-white font-['Amiri']">${s.name_arabic}</span>
                            <span class="text-gray-400 text-[11px]">${s.name_simple}</span>
                        </div>
                    </div>
                `).join('');
                list.classList.remove('hidden');
            } else { list.classList.add('hidden'); }
        } else { list.classList.add('hidden'); }
    } catch (err) { console.error(err); }
}

function applySelection(name, id) {
    selectedSurahId = id;
    const input = document.getElementById('newVerseKey');
    input.value = name + " : ";
    input.focus();
    document.getElementById('adminSearchList').classList.add('hidden');
}

async function showVersePreview(key) {
    try {
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani`);
        if (!res.ok) throw new Error("آية غير موجودة");
        const data = await res.json();
        const [s, a] = key.split(':');
        const surah = allSurahs.find(surah => surah.id == s);

        document.getElementById('previewName').innerText = `سورة ${surah.name_arabic} : آية ${a}`;
        document.getElementById('previewText').innerText = data.verse.text_uthmani;
        document.getElementById('previewCard').classList.remove('hidden');
        confirmedKey = key;
    } catch (e) {
        document.getElementById('previewCard').classList.add('hidden');
        showStatus("⚠️ " + e.message, "text-orange-400");
    }
}

/**
 * 5. BROADCAST ACTIONS
 */
async function handlePrimaryAction() {
    if (adminMode === 'quran') {
        await updateDailyVerse();
    } else {
        await saveHadithNote();
    }
}

async function updateDailyVerse() {
    if (!confirmedKey) return;
    const btn = document.getElementById('updateBtn');
    const noteValue = document.getElementById('verseNote').value.trim();

    btn.disabled = true;
    btn.innerText = "جاري البث...";

    try {
        const { error: configError } = await sb
            .from('site_config')
            .update({ verse_key: confirmedKey })
            .eq('id', 'daily_verse');
        if (configError) throw configError;

        if (noteValue) {
            const { error: noteError } = await sb.from('verse_notes').upsert({
                verse_key: confirmedKey,
                note_text: noteValue
            }, { onConflict: 'verse_key' });
            if (noteError) throw noteError;
        }

        document.getElementById('liveVerse').innerText = confirmedKey;
        resetForm();
        showStatus("✅ تم تحديث الآية والهدايات!", "text-teal-400");
    } catch (err) {
        showStatus("❌ فشل التحديث: " + err.message, "text-red-400");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>تأكيد وبث التحديث</span><ion-icon name="paper-plane-outline"></ion-icon>`;
    }
}

async function saveHadithNote() {
    const bookKey = document.getElementById('hadithBookSelect').value;
    const hadithNum = document.getElementById('hadithNumberInput').value;
    const noteText = document.getElementById('verseNote').value.trim();
    const btn = document.getElementById('updateBtn');

    if (!hadithNum || !noteText) {
        showStatus("⚠️ أكمل البيانات أولاً", "text-orange-400");
        return;
    }

    btn.disabled = true;
    btn.innerText = "جاري الحفظ...";

    try {
        const { error: configError } = await sb
            .from('site_config')
            .update({
                book_key: bookKey,
                hadith_number: parseInt(hadithNum)
            })
            .eq('id', 'daily_hadith');

        if (configError) throw configError;

        const { error: noteError } = await sb
            .from('hadith_notes')
            .upsert({
                book_key: bookKey,
                hadith_number: parseInt(hadithNum),
                note_text: noteText
            }, { onConflict: 'book_key,hadith_number' });

        if (noteError) throw noteError;

        document.getElementById('liveHadith').innerText = `${bookKey} #${hadithNum}`;
        showStatus("✅ تم بث الحديث وحفظ الهداية!", "text-teal-400");
        document.getElementById('hadithNumberInput').value = "";
        document.getElementById('verseNote').value = "";
    } catch (err) {
        showStatus("❌ خطأ: " + err.message, "text-red-400");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>حفظ هداية الحديث</span><ion-icon name="paper-plane-outline"></ion-icon>`;
    }
}

/**
 * 6. HELPERS & EVENT LISTENERS
 */
function resetForm() {
    const keyInput = document.getElementById('newVerseKey');
    const noteInput = document.getElementById('verseNote');
    if (keyInput) keyInput.value = "";
    if (noteInput) noteInput.value = "";
    document.getElementById('previewCard')?.classList.add('hidden');
    selectedSurahId = null;
    confirmedKey = null;
}

function showStatus(text, color) {
    const msg = document.getElementById('statusMsg');
    if (!msg) return;
    msg.innerText = text;
    msg.className = `text-center text-xs mt-4 ${color} animate-pulse`;
    setTimeout(() => { if (msg.innerText === text) msg.innerText = ""; }, 5000);
}

// Keyboard Navigation for Search List
document.getElementById('newVerseKey')?.addEventListener('keydown', function (e) {
    const list = document.getElementById('adminSearchList');
    const items = list.querySelectorAll('div');
    const card = document.getElementById('previewCard');

    if (list.classList.contains('hidden')) {
        if (e.key === 'Enter' && adminMode === 'quran' && !card.classList.contains('hidden')) {
            updateDailyVerse();
        }
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSearchIndex = (activeSearchIndex + 1) % items.length;
        updateSearchHighlight(items);
    }
    else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSearchIndex = (activeSearchIndex - 1 + items.length) % items.length;
        updateSearchHighlight(items);
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSearchIndex > -1 && items[activeSearchIndex]) {
            items[activeSearchIndex].click();
        } else if (items.length > 0) {
            items[0].click();
        }
    }
});

function updateSearchHighlight(items) {
    items.forEach((item, index) => {
        if (index === activeSearchIndex) {
            item.classList.add('bg-teal-900/50', 'text-teal-400', 'border-r-4', 'border-teal-400');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('bg-teal-900/50', 'text-teal-400', 'border-r-4', 'border-teal-400');
        }
    });
}

// Global scope expose for HTML onclick events
window.switchAdminMode = switchAdminMode;
window.handlePrimaryAction = handlePrimaryAction;
window.unifiedAdminLogic = unifiedAdminLogic;
window.applySelection = applySelection;

// Start Security Gate
checkAdminAccess();