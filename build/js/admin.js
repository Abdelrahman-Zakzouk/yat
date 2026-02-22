// --- CONFIGURATION ---
const SUPABASE_URL = "https://ruokjdtnpraaglmewjwa.supabase.co";
const SUPABASE_KEY = "sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-";
const ADMIN_PASSWORD = "Zakzoukk_2006";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL STATE ---
let allSurahs = [];
let selectedSurahId = null;
let confirmedKey = null;
let activeSearchIndex = -1;

// --- 1. INITIALIZATION & LOGIN ---
window.addEventListener('DOMContentLoaded', () => {
    const passInput = document.getElementById('adminPass');
    if (passInput) passInput.focus();
});

document.getElementById('adminPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkAuth();
});

function checkAuth() {
    const pass = document.getElementById('adminPass').value;
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('adminContent').classList.remove('hidden');
        fetchInitialData();
        setTimeout(() => document.getElementById('newVerseKey').focus(), 100);
    } else {
        showStatus("❌ Invalid Password", "text-red-500", true);
    }
}

async function fetchInitialData() {
    try {
        const res = await fetch('https://api.quran.com/api/v4/chapters?language=en');
        if (!res.ok) throw new Error("API Failure");
        const data = await res.json();
        allSurahs = data.chapters;

        const { data: sbData, error } = await sb.from('site_config').select('*').eq('id', 'daily_verse').single();
        if (error) throw error;
        if (sbData) {
            document.getElementById('liveVerse').innerText = sbData.verse_key;
            // Pre-fill the note if you want to edit the current one
            document.getElementById('verseNote').value = sbData.verse_note || "";
        }
    } catch (e) {
        showStatus("⚠️ Connection Error: " + e.message, "text-orange-400");
    }
}

// --- 2. KEYBOARD NAVIGATION ---
document.getElementById('newVerseKey').addEventListener('keydown', function (e) {
    const list = document.getElementById('adminSearchList');
    const items = list.querySelectorAll('div');
    const card = document.getElementById('previewCard');

    if (list.classList.contains('hidden')) {
        // If focusing the note textarea, don't trigger broadcast on Enter
        if (e.key === 'Enter' && e.target.id === 'newVerseKey' && !card.classList.contains('hidden') && confirmedKey) {
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

// --- 3. SEARCH & PREVIEW ---
async function unifiedAdminLogic() {
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
            const parts = inputVal.split(':');
            const ayah = parts[1].trim();
            if (ayah.length > 0) {
                list.classList.add('hidden');
                await showVersePreview(`${selectedSurahId}:${ayah}`);
            }
            return;
        }

        card.classList.add('hidden');
        confirmedKey = null;

        if (inputVal.length > 0 && !inputVal.includes(':')) {
            const matches = allSurahs.filter(s =>
                s.name_arabic.includes(inputVal) ||
                s.name_simple.toLowerCase().includes(inputVal)
            ).slice(0, 5);

            if (matches.length > 0) {
                list.innerHTML = matches.map(s => `
                    <div onclick="applySelection('${s.name_arabic}', ${s.id})" class="p-4 cursor-pointer border-b border-white/5 text-right flex justify-between items-center transition-colors">
                        <span class="text-teal-600 text-[10px] font-bold">#${s.id}</span>
                        <div class="flex flex-col items-end">
                            <span class="text-white font-['Amiri']">${s.name_arabic}</span>
                            <span class="text-gray-400 text-[11px]">${s.name_simple}</span>
                        </div>
                    </div>
                `).join('');
                list.classList.remove('hidden');
            } else {
                list.classList.add('hidden');
            }
        } else {
            list.classList.add('hidden');
        }
    } catch (err) { console.error(err); }
}

function applySelection(name, id) {
    const input = document.getElementById('newVerseKey');
    selectedSurahId = id;
    input.value = name + " : ";
    input.focus();
    document.getElementById('adminSearchList').classList.add('hidden');
}

async function showVersePreview(key) {
    try {
        const [s, a] = key.split(':').map(v => v.trim());
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani`);

        if (res.status === 404) throw new Error("Verse not found");
        const data = await res.json();
        const surah = allSurahs.find(surah => surah.id == s);

        document.getElementById('previewName').innerText = applyHamzaFilter(`سورة ${surah.name_arabic} : آية ${a}`);
        document.getElementById('previewText').innerText = applyHamzaFilter(data.verse.text_uthmani);

        document.getElementById('previewCard').classList.remove('hidden');
        confirmedKey = key;
    } catch (e) {
        document.getElementById('previewCard').classList.add('hidden');
        confirmedKey = null;
        showStatus("⚠️ " + e.message, "text-orange-400");
    }
}

// --- 4. DATA PUSH WITH NOTE ---
// --- 4. DATA PUSH (FIXED FOR TWO TABLES) ---
async function updateDailyVerse() {
    if (!confirmedKey) return;
    const btn = document.getElementById('updateBtn');
    const noteValue = document.getElementById('verseNote').value.trim();

    btn.disabled = true;
    btn.innerText = "Broadcasting...";

    try {
        // A. Update the "Remote Control" (Daily Verse Key)
        const { error: configError } = await sb
            .from('site_config')
            .update({ verse_key: confirmedKey })
            .eq('id', 'daily_verse');

        if (configError) throw configError;

        // B. Update or Insert the "Lesson" (Verse Note)
        if (noteValue) {
            const { error: noteError } = await sb
                .from('verse_notes')
                .insert({
                    verse_key: confirmedKey,
                    note_text: noteValue
                }, { onConflict: 'verse_key' }); // Updates if exists, inserts if new

            if (noteError) throw noteError;
        }

        // UI Updates
        document.getElementById('liveVerse').innerText = confirmedKey;
        document.getElementById('newVerseKey').value = "";
        document.getElementById('verseNote').value = ""; // Clear note after send
        document.getElementById('previewCard').classList.add('hidden');
        showStatus("✅ Verse & Note Live!", "text-teal-400");

        selectedSurahId = null;
        confirmedKey = null;
    } catch (err) {
        showStatus("❌ Failed: " + err.message, "text-red-400");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Broadcast Update</span><ion-icon name="paper-plane-outline"></ion-icon>`;
    }
}

function showStatus(text, color, isAlert = false) {
    const msg = document.getElementById('statusMsg');
    msg.innerText = text;
    msg.className = `text-center text-xs mt-4 ${color} animate-pulse`;
    if (isAlert) alert(text);
    setTimeout(() => { if (msg.innerText === text) msg.innerText = ""; }, 5000);
}