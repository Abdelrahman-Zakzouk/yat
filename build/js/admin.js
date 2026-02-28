/**
 * Bayan | Admin Panel - Unified Logic
 * Features: Security Heartbeat, Real-time Stats, Daily Verse/Hadith, and Role Management
 */

// --- CONFIGURATION ---
let sb = window.sb || null;

/**
 * Ensures the Supabase client is ready before any operations
 */
async function ensureSb() {
    if (sb && sb.auth) return sb;
    if (window.getSupabaseClient) {
        try {
            await window.getSupabaseClient();
            sb = window.sb || window.supabaseClient || window.sbClient;
            return sb;
        } catch (e) {
            console.warn('Supabase client initialization failed:', e);
            throw e;
        }
    }
    if (window.sb) { sb = window.sb; return sb; }
    throw new Error('Supabase client not found');
}

// --- GLOBAL STATE ---
let allSurahs = [];
let confirmedKey = null;
let adminMode = 'quran';
let adminCheckInterval = null;

/**
 * 1. SECURITY & HEARTBEAT
 */
async function checkAdminAccess() {
    try {
        const client = await ensureSb();
        const { data: { user } } = await client.auth.getUser();

        if (!user) {
            window.location.href = '/build/html/auth.html';
            return;
        }

        const { data: profile, error } = await client
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (error || !profile?.is_admin) {
            console.warn("Unauthorized access. Redirecting...");
            stopHeartbeat();
            window.location.href = '/build/html/profile.html';
            return;
        }

        const adminContent = document.getElementById('adminContent');
        if (adminContent && adminContent.classList.contains('hidden')) {
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            adminContent.classList.remove('hidden');

            fetchInitialData();
            initStatsTracking();
            startHeartbeat();
        }
    } catch (err) {
        console.error("Security Check Failure:", err);
    }
}

function startHeartbeat() {
    if (adminCheckInterval) return;
    adminCheckInterval = setInterval(checkAdminAccess, 30000);
}

function stopHeartbeat() {
    clearInterval(adminCheckInterval);
    adminCheckInterval = null;
}

/**
 * Fetch Initial Data
 */
async function fetchInitialData() {
    try {
        const client = await ensureSb();
        const res = await fetch('https://api.quran.com/api/v4/chapters?language=en');
        const data = await res.json();
        allSurahs = data.chapters;

        const { data: configs, error } = await client.from('site_config').select('*');
        if (error) throw error;

        const verseConfig = configs.find(c => c.id === 'daily_verse');
        const hadithConfig = configs.find(c => c.id === 'daily_hadith');

        updateLiveDisplay(verseConfig, hadithConfig);
    } catch (e) {
        showStatus("⚠️ Data fetch failed", "text-orange-400");
    }
}

function updateLiveDisplay(verse, hadith) {
    const displayEl = document.getElementById('liveDisplay');
    if (!displayEl) return;

    if (adminMode === 'quran' && verse) {
        displayEl.innerText = verse.verse_key || '-:-';
    } else if (adminMode === 'hadith' && hadith) {
        displayEl.innerText = `${hadith.book_key?.split('-')[1] || 'Hadith'} #${hadith.hadith_number}`;
    }
}

/**
 * 2. REAL-TIME STATS
 */
async function initStatsTracking() {
    try {
        const client = await ensureSb();
        const presenceChannel = client.channel('online-users');

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const count = Object.keys(state).length;
                const activeEl = document.getElementById('activeUsersCount');
                if (activeEl) activeEl.innerText = count;
            })
            .subscribe();

        fetchTotalVisits();
    } catch (e) { console.error("Stats tracking error:", e); }
}

async function fetchTotalVisits() {
    try {
        const client = await ensureSb();
        const { data } = await client.from('site_stats').select('count').eq('id', 'total_visits').single();
        if (data) {
            const totalEl = document.getElementById('totalVisitsCount');
            if (totalEl) totalEl.innerText = data.count.toLocaleString();
        }
    } catch (e) { console.error(e); }
}

/**
 * 3. MODE SWITCHING
 */
function switchAdminMode(mode) {
    adminMode = mode;
    const qBtn = document.getElementById('quranTabBtn');
    const hBtn = document.getElementById('hadithTabBtn');
    const rBtn = document.getElementById('rolesTabBtn');

    const qArea = document.getElementById('quranInputArea');
    const hArea = document.getElementById('hadithInputArea');
    const rArea = document.getElementById('rolesInputArea');

    [qBtn, hBtn, rBtn].forEach(b => b?.classList.remove('bg-teal-600', 'text-white'));
    [qArea, hArea, rArea].forEach(a => a?.classList.add('hidden'));

    const liveIndicator = document.getElementById('liveIndicator');
    const previewCard = document.getElementById('previewCard');

    if (mode === 'quran') {
        qBtn?.classList.add('bg-teal-600', 'text-white');
        qArea?.classList.remove('hidden');
        document.getElementById('adminTitle').innerText = "Broadcast Verse of the Day";
        liveIndicator?.classList.remove('hidden');
    } else if (mode === 'hadith') {
        hBtn?.classList.add('bg-teal-600', 'text-white');
        hArea?.classList.remove('hidden');
        document.getElementById('adminTitle').innerText = "Hadith Lessons";
        liveIndicator?.classList.remove('hidden');
    } else if (mode === 'roles') {
        rBtn?.classList.add('bg-teal-600', 'text-white');
        rArea?.classList.remove('hidden');
        document.getElementById('adminTitle').innerText = "Admin Management";
        liveIndicator?.classList.add('hidden');
        previewCard?.classList.add('hidden');
        loadAdminList();
    }

    // Clear preview when switching
    previewCard?.classList.add('hidden');
    fetchInitialData();
}

/**
 * 4. SEARCH & PREVIEW LOGIC
 */
async function unifiedAdminLogic() {
    const card = document.getElementById('previewCard');
    const list = document.getElementById('adminSearchList');
    const previewText = document.getElementById('previewText');

    if (adminMode === 'quran') {
        const inputField = document.getElementById('newVerseKey');
        const inputVal = inputField.value.trim().toLowerCase();

        if (/^\d+:\d+$/.test(inputVal)) {
            list.classList.add('hidden');
            await showVersePreview(inputVal);
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
                    <div onclick="applySelection('${s.name_arabic}', ${s.id})" class="p-4 cursor-pointer border-b border-white/5 text-right flex justify-between items-center hover:bg-teal-900/20">
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
    }
    else if (adminMode === 'hadith') {
        const num = document.getElementById('hadithNumberInput').value;
        const book = document.getElementById('hadithBookSelect').value;

        if (num > 0) {
            document.getElementById('previewName').innerText = `Update Lesson: ${book} #${num}`;
            previewText.innerText = "جاري تحميل الحديث...";
            card?.classList.remove('hidden');

            try {
                // Fetch specific Hadith file from the new API structure
                const res = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${book}/${num}.json`);
                if (!res.ok) throw new Error("Hadith not found");

                const data = await res.json();
                // Individual files use the 'hadiths' array property
                previewText.innerText = data.hadiths ? data.hadiths[0].text : "Text Error";
            } catch (e) {
                previewText.innerText = "⚠️ تعذر تحميل نص الحديث من المصدر، لكن يمكنك حفظ الملاحظات.";
            }
        } else {
            card?.classList.add('hidden');
        }
    }
}

function applySelection(name, id) {
    const input = document.getElementById('newVerseKey');
    input.value = `${id}:`;
    input.focus();
    document.getElementById('adminSearchList').classList.add('hidden');
}

async function showVersePreview(key) {
    try {
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani`);
        if (!res.ok) throw new Error("Verse not found");
        const data = await res.json();

        const [sId] = key.split(':');
        const surah = allSurahs.find(s => s.id == sId);

        document.getElementById('previewName').innerText = `Surah ${surah?.name_simple || sId} : Ayah ${key.split(':')[1]}`;
        document.getElementById('previewText').innerText = data.verse.text_uthmani;
        document.getElementById('previewCard').classList.remove('hidden');
        confirmedKey = key;
    } catch (e) {
        showStatus("⚠️ " + e.message, "text-orange-400");
    }
}

/**
 * 5. ADMIN ROLES
 */
async function loadAdminList() {
    const container = document.getElementById('adminList');
    try {
        const client = await ensureSb();
        const { data, error } = await client.from('profiles').select('id, email, is_admin').eq('is_admin', true);
        if (error) throw error;

        container.innerHTML = data.map(admin => `
            <div class="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 mb-2">
                <div class="flex flex-col">
                    <span class="text-sm text-white">${admin.email || 'No Email'}</span>
                    <span class="text-[9px] text-gray-500 font-mono">${admin.id}</span>
                </div>
                <button onclick="removeAdminRole('${admin.id}')" class="text-red-400 hover:text-red-300 p-2">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = `<div class="text-red-400 text-xs text-center p-4">Failed to load list</div>`;
    }
}

async function assignAdminRole() {
    const input = document.getElementById('adminSearchInput');
    const searchValue = input.value.trim();
    if (!searchValue) return showStatus("⚠️ Enter Email", "text-orange-400");

    try {
        const client = await ensureSb();
        const { data, error } = await client.from('profiles').update({ is_admin: true }).ilike('email', searchValue).select();
        if (error) throw error;
        if (!data.length) throw new Error("User not found");

        showStatus(`✅ Promoted: ${searchValue}`, "text-teal-400");
        input.value = "";
        loadAdminList();
    } catch (e) { showStatus("❌ Error: " + e.message, "text-red-400"); }
}

async function removeAdminRole(userId) {
    const client = await ensureSb();
    const { data: { user } } = await client.auth.getUser();
    if (user.id === userId) return alert("Cannot remove yourself!");
    if (!confirm("Remove admin rights?")) return;

    try {
        await client.from('profiles').update({ is_admin: false }).eq('id', userId);
        showStatus("✅ Admin removed", "text-teal-400");
        loadAdminList();
    } catch (e) { showStatus("❌ Failed", "text-red-400"); }
}

/**
 * 6. SAVE ACTIONS
 */
async function handlePrimaryAction() {
    if (adminMode === 'quran') await updateDailyVerse();
    else if (adminMode === 'hadith') await saveHadithNote();
}

async function updateDailyVerse() {
    if (!confirmedKey) return;
    const note = document.getElementById('contentNote').value.trim();
    try {
        const client = await ensureSb();
        await client.from('site_config').update({ verse_key: confirmedKey }).eq('id', 'daily_verse');
        if (note) {
            await client.from('verse_notes').upsert({
                verse_key: confirmedKey,
                note_text: note
            }, { onConflict: 'verse_key' });
        }
        showStatus("✅ Verse Broadcasted!", "text-teal-400");
        fetchInitialData();
    } catch (err) { showStatus("❌ Error", "text-red-400"); }
}

async function saveHadithNote() {
    const book = document.getElementById('hadithBookSelect')?.value;
    const num = document.getElementById('hadithNumberInput')?.value;
    const note = document.getElementById('contentNote')?.value.trim();

    if (!num) return showStatus("⚠️ Missing Number", "text-orange-400");

    try {
        const client = await ensureSb();

        // 1. Update Global Site Config
        const { error: configError } = await client
            .from('site_config')
            .update({ book_key: book, hadith_number: num })
            .eq('id', 'daily_hadith');

        if (configError) throw configError;

        // 2. Update Specific Hadith Lesson Notes
        if (note) {
            const { error: noteError } = await client
                .from('hadith_notes')
                .upsert({
                    book_key: book,
                    hadith_number: num.toString(), // Ensure consistent typing
                    note_text: note
                }, { onConflict: 'book_key,hadith_number' });
            if (noteError) throw noteError;
        }

        showStatus("✅ Hadith Updated!", "text-teal-400");
        fetchInitialData();
    } catch (err) {
        console.error("Save Error Details:", err);
        showStatus(`❌ Error: ${err.message}`, "text-red-400");
    }
}

function showStatus(text, color) {
    const msg = document.getElementById('statusMsg');
    if (!msg) return;
    msg.innerText = text;
    msg.className = `text-center text-xs mt-4 ${color} animate-pulse`;
    setTimeout(() => { msg.innerText = ""; }, 5000);
}

// Initialize
checkAdminAccess();

// Export to window
window.switchAdminMode = switchAdminMode;
window.handlePrimaryAction = handlePrimaryAction;
window.unifiedAdminLogic = unifiedAdminLogic;
window.applySelection = applySelection;
window.assignAdminRole = assignAdminRole;
window.removeAdminRole = removeAdminRole;