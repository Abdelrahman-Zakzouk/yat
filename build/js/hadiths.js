/**
 * يتلو | Yatlo Hadiths - BigYusuf RapidAPI Edition
 */

tailwind.config = {
    theme: {
        extend: {
            colors: {
                teal: {
                    900: '#0f1a19',
                }
            }
        }
    }
};

const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';

const HadithEngine = {
    BASE_URL: "https://hadiths-api.p.rapidapi.com/hadiths",
    RAPID_KEY: "2f6fdbe126msh0c46da96afc8f1cp1fba78jsn2140bfdb1b89",
    RAPID_HOST: "hadiths-api.p.rapidapi.com",
    current: null,
    currentMode: 'daily',
    sb: null
};

// 1. Initialize Supabase
try {
    if (typeof supabase !== 'undefined') {
        HadithEngine.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.warn("Supabase initialization failed:", e);
}

// 2. Main Controller
async function init() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'daily';
    setMode(mode);
}

async function setMode(mode) {
    HadithEngine.currentMode = mode;
    const bg = document.getElementById('toggleBg');
    const btnDaily = document.getElementById('btn-daily');
    const btnRandom = document.getElementById('btn-random');
    const controls = document.getElementById('randomControls');

    if (mode === 'daily') {
        if (bg) { bg.style.right = '4px'; bg.style.left = 'auto'; }
        btnDaily?.classList.add('text-white');
        btnDaily?.classList.remove('text-slate-500');
        btnRandom?.classList.add('text-slate-500');
        btnRandom?.classList.remove('text-white');
        controls?.classList.add('hidden');
        await loadDailyHadith();
    } else {
        if (bg) { bg.style.right = 'auto'; bg.style.left = '4px'; }
        btnRandom?.classList.add('text-white');
        btnRandom?.classList.remove('text-slate-500');
        btnDaily?.classList.add('text-slate-500');
        btnDaily?.classList.remove('text-white');
        controls?.classList.remove('hidden');
        await fetchRandomHadith();
    }
}

// 3. Data Fetching
async function loadDailyHadith() {
    setLoadingState(true);
    try {
        const { data: config } = await HadithEngine.sb
            .from('site_config')
            .select('hadith_number')
            .eq('id', 'daily_hadith')
            .maybeSingle();

        if (config?.hadith_number) {
            await fetchHadithById(config.hadith_number);
        } else {
            await fetchRandomHadith();
        }
    } catch (e) {
        console.error("Daily Hadith fetch failed:", e);
        await fetchRandomHadith();
    } finally {
        setLoadingState(false);
    }
}

async function safeJson(response) {
    try {
        return await response.json();
    } catch (e) {
        throw new Error("Non-JSON response from API");
    }
}

async function fetchHadithById(id) {
    if (!id) return;
    setLoadingState(true);
    try {
        const response = await fetch(`${HadithEngine.BASE_URL}/${id}`, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': HadithEngine.RAPID_KEY,
                'x-rapidapi-host': HadithEngine.RAPID_HOST
            }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await safeJson(response);
        processHadith(data);

    } catch (e) {
        console.error("Specific fetch failed:", e);
    } finally {
        setLoadingState(false);
    }
}

async function fetchRandomHadith() {
    setLoadingState(true);
    try {
        const response = await fetch(`${HadithEngine.BASE_URL}?limit=20&page=1`, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': HadithEngine.RAPID_KEY,
                'x-rapidapi-host': HadithEngine.RAPID_HOST
            }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const result = await safeJson(response);
        const list = result.data || result;

        if (!Array.isArray(list) || list.length === 0) {
            throw new Error("Empty API response");
        }

        const entry = list[Math.floor(Math.random() * list.length)];
        processHadith(entry);

    } catch (e) {
        console.error("Random fetch failed:", e);
        showToast("⚠️ فشل تحميل الحديث");
    } finally {
        setLoadingState(false);
    }
}

// Process Hadith
function processHadith(entry) {
    if (!entry) return;
    HadithEngine.current = {
        text: (entry.matn || entry.hadith || "").replace(/<[^>]*>?/gm, '').trim(),
        id: entry._id || entry.id,
        number: entry.hadith_number || entry.number || "---",
        bookName: entry.book?.name || entry.book || "حديث شريف"
    };
    if (!HadithEngine.current.id) {
        console.warn("No valid Hadith ID; skipping Supabase notes");
    } else {
        fetchHadithNote(HadithEngine.current.id);
    }
    renderHadithUI();
}

// 4. UI & Notes
function renderHadithUI() {
    const textEl = document.getElementById('hadithText');
    const metaEl = document.getElementById('hadithMeta');
    if (textEl && HadithEngine.current) {
        textEl.innerText = HadithEngine.current.text;
        textEl.style.opacity = "1";
    }
    if (metaEl && HadithEngine.current) {
        metaEl.innerText = `${HadithEngine.current.bookName} | رقم ${HadithEngine.current.number}`;
    }
}

async function fetchHadithNote(id) {
    if (!HadithEngine.sb || !id) return;
    try {
        const { data } = await HadithEngine.sb
            .from('hadith_notes')
            .select('note_text')
            .eq('hadith_id', id)
            .maybeSingle();
        const notePanel = document.getElementById('hadithNotePanel');
        const noteContent = document.getElementById('hadithNoteContent');

        if (data?.note_text?.trim()) {
            noteContent.innerHTML = `<div class="lesson-container fade-in"><span class="lesson-title">هدايات الحديث:</span><p class="lesson-text">${data.note_text}</p></div>`;
            notePanel.classList.remove('hidden');
        } else {
            notePanel?.classList.add('hidden');
        }
    } catch (e) {
        console.warn("Hadith notes fetch failed:", e);
    }
}

function setLoadingState(isLoading) {
    const textEl = document.getElementById('hadithText');
    if (textEl) textEl.style.opacity = isLoading ? "0.2" : "1";
}

// 5. Sharing & Modals
// ... keep your shareAsImage, copyImageToClipboard, triggerNativeShare as is ...

window.setMode = setMode;
window.fetchRandomHadith = fetchRandomHadith;
window.fetchHadithById = fetchHadithById;

document.addEventListener('DOMContentLoaded', init);