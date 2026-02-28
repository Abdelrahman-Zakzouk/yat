/**
 * Yatlo | Admin Panel - Unified Logic
 * Features: Security Heartbeat, Real-time Stats, Daily Verse/Hadith, and Role Management
 */

// --- CONFIGURATION ---
const SUPABASE_URL = "https://ruokjdtnpraaglmewjwa.supabase.co";
const SUPABASE_KEY = "sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL STATE ---
let allSurahs = [];
let selectedSurahId = null;
let confirmedKey = null;
let adminMode = 'quran';
let adminCheckInterval = null;

/**
 * 1. SECURITY & HEARTBEAT
 */
async function checkAdminAccess() {
    try {
        const { data: { user } } = await sb.auth.getUser();

        if (!user) {
            window.location.href = '/build/html/auth.html';
            return;
        }

        // Check is_admin status in profiles table
        const { data: profile, error } = await sb
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (error || !profile?.is_admin) {
            console.warn("Unauthorized access detected. Redirecting...");
            stopHeartbeat(); // Stop the interval
            window.location.href = '/build/html/profile.html';
            return;
        }

        // Success: If we haven't initialized yet, do it now
        const adminContent = document.getElementById('adminContent');
        if (adminContent && adminContent.classList.contains('hidden')) {
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            adminContent.classList.remove('hidden');

            fetchInitialData();
            initStatsTracking();
            startHeartbeat(); // Start the periodic check
        }
    } catch (err) {
        console.error("Security Check Failed:", err);
    }
}

/**
 * Periodically checks if the user is still an admin.
 * If rights are revoked in the DB, this kicks them out instantly.
 */
function startHeartbeat() {
    if (adminCheckInterval) return;
    adminCheckInterval = setInterval(checkAdminAccess, 30000); // Check every 30 seconds
}

function stopHeartbeat() {
    clearInterval(adminCheckInterval);
    adminCheckInterval = null;
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

    } catch (e) {
        showStatus("⚠️ Connection Error: " + e.message, "text-orange-400");
    }
}

/**
 * 2. REAL-TIME STATS (Listener)
 */
async function initStatsTracking() {
    // We listen to the channel managed by global.js
    const presenceChannel = sb.channel('online-users');

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const count = Object.keys(state).length;

            const activeEl = document.getElementById('activeUsersCount');
            if (activeEl) activeEl.innerText = count;
        })
        .subscribe();

    fetchTotalVisits();
}

async function fetchTotalVisits() {
    try {
        const { data } = await sb.from('site_stats').select('count').eq('id', 'total_visits').single();
        if (data) {
            const totalEl = document.getElementById('totalVisitsCount');
            if (totalEl) totalEl.innerText = data.count.toLocaleString();
        }
    } catch (e) { console.error(e); }
}

/**
 * 3. MODE SWITCHING (Tabs)
 */
function switchAdminMode(mode) {
    adminMode = mode;
    const qBtn = document.getElementById('quranTabBtn');
    const hBtn = document.getElementById('hadithTabBtn');
    const rBtn = document.getElementById('rolesTabBtn');

    const qArea = document.getElementById('quranInputArea');
    const hArea = document.getElementById('hadithInputArea');
    const rArea = document.getElementById('rolesInputArea');

    const title = document.getElementById('adminTitle');
    const live = document.getElementById('liveIndicator');
    const card = document.getElementById('previewCard');

    [qBtn, hBtn, rBtn].forEach(b => b?.classList.remove('bg-teal-600', 'text-white'));
    [qArea, hArea, rArea].forEach(a => a?.classList.add('hidden'));

    if (mode === 'quran') {
        qBtn?.classList.add('bg-teal-600', 'text-white');
        qArea?.classList.remove('hidden');
        title.innerText = "Broadcast Verse of the Day";
        if (live) live.style.display = "flex";
    } else if (mode === 'hadith') {
        hBtn?.classList.add('bg-teal-600', 'text-white');
        hArea?.classList.remove('hidden');
        title.innerText = "Hadith Lessons";
        if (live) live.style.display = "none";
    } else if (mode === 'roles') {
        rBtn?.classList.add('bg-teal-600', 'text-white');
        rArea?.classList.remove('hidden');
        title.innerText = "Admin Management";
        if (live) live.style.display = "none";
        card?.classList.add('hidden');
        loadAdminList();
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

    try {
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
        if (!res.ok) throw new Error("Verse not found");
        const data = await res.json();
        const [s, a] = key.split(':');
        const surah = allSurahs.find(surah => surah.id == s);

        document.getElementById('previewName').innerText = `Surah ${surah.name_simple} : Ayah ${a}`;
        document.getElementById('previewText').innerText = data.verse.text_uthmani;
        document.getElementById('previewCard').classList.remove('hidden');
        confirmedKey = key;
    } catch (e) {
        showStatus("⚠️ " + e.message, "text-orange-400");
    }
}

/**
 * 5. ADMIN ROLES MANAGEMENT
 */
async function loadAdminList() {
    const container = document.getElementById('adminList');
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('id, email, is_admin')
            .eq('is_admin', true);

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
    if (!searchValue) return showStatus("⚠️ Enter Email or User ID", "text-orange-400");

    try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchValue);
        let query = sb.from('profiles').update({ is_admin: true });

        if (isUUID) query = query.eq('id', searchValue);
        else query = query.ilike('email', searchValue);

        const { data, error } = await query.select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("User not found.");

        showStatus(`✅ Promoted: ${data[0].email || 'User'}`, "text-teal-400");
        input.value = "";
        loadAdminList();
    } catch (e) { showStatus("❌ Error: " + e.message, "text-red-400"); }
}

async function removeAdminRole(userId) {
    const { data: { user } } = await sb.auth.getUser();
    if (user.id === userId) return alert("You cannot remove your own admin rights!");
    if (!confirm("Are you sure you want to remove this admin?")) return;

    try {
        const { error } = await sb.from('profiles').update({ is_admin: false }).eq('id', userId);
        if (error) throw error;
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
    const btn = document.getElementById('updateBtn');
    const noteValue = document.getElementById('verseNote').value.trim();

    btn.disabled = true;
    btn.innerText = "Broadcasting...";

    try {
        await sb.from('site_config').update({ verse_key: confirmedKey }).eq('id', 'daily_verse');
        if (noteValue) {
            await sb.from('verse_notes').upsert({ verse_key: confirmedKey, note_text: noteValue });
        }
        document.getElementById('liveVerse').innerText = confirmedKey;
        showStatus("✅ Verse Broadcasted!", "text-teal-400");
        resetForm();
    } catch (err) { showStatus("❌ Error", "text-red-400"); }
    finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Broadcast Update</span><ion-icon name="paper-plane-outline"></ion-icon>`;
    }
}

async function saveHadithNote() {
    const book = document.getElementById('hadithBookSelect').value;
    const num = document.getElementById('hadithNumberInput').value;
    const note = document.getElementById('verseNote').value.trim();

    if (!num || !note) return showStatus("⚠️ Missing Data", "text-orange-400");

    try {
        await sb.from('site_config').update({ book_key: book, hadith_number: num }).eq('id', 'daily_hadith');
        await sb.from('hadith_notes').upsert({ book_key: book, hadith_id: num, note_text: note });
        document.getElementById('liveHadith').innerText = `${book} #${num}`;
        showStatus("✅ Hadith Note Saved!", "text-teal-400");
    } catch (err) { showStatus("❌ Error", "text-red-400"); }
}

function resetForm() {
    document.getElementById('newVerseKey').value = "";
    document.getElementById('verseNote').value = "";
    document.getElementById('previewCard')?.classList.add('hidden');
}

function showStatus(text, color) {
    const msg = document.getElementById('statusMsg');
    if (!msg) return;
    msg.innerText = text;
    msg.className = `text-center text-xs mt-4 ${color} animate-pulse`;
    setTimeout(() => { msg.innerText = ""; }, 5000);
}

// Global Exports
window.switchAdminMode = switchAdminMode;
window.handlePrimaryAction = handlePrimaryAction;
window.unifiedAdminLogic = unifiedAdminLogic;
window.applySelection = applySelection;
window.assignAdminRole = assignAdminRole;
window.removeAdminRole = removeAdminRole;

// Start Security Check
checkAdminAccess();