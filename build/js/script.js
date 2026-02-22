/**
 * يتلو | Yatlo Quran - Unified Logic
 * Handles: Hamza Filtering, Supabase OTA Updates, Quran API, Audio, and Sharing
 */

// --- GLOBAL STATE ---
let currentSurahNumber = null;
let currentVerseKey = null;
let currentAudio = new Audio();
let allSurahs = [];
let isRandomMode = false;

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global Override List for Hamza corrections
const HAMZA_OVERRIDES = {
  "النبإ": "النبأ",
  "سبإ": "سبأ",
  "الانسان": "الإنسان",
  "الإنفطار": "الانفطار",
  "الإنشقاق": "الانشقاق",
};

// --- 1. THE FILTERS (THE ENGINE) ---

function applyHamzaFilter(data) {
  if (typeof data === 'string') {
    let corrected = data;
    for (const [wrong, right] of Object.entries(HAMZA_OVERRIDES)) {
      corrected = corrected.split(wrong).join(right);
    }
    return corrected;
  } else if (Array.isArray(data)) {
    return data.map(item => applyHamzaFilter(item));
  } else if (typeof data === 'object' && data !== null) {
    const cleaned = {};
    for (const key in data) {
      cleaned[key] = applyHamzaFilter(data[key]);
    }
    return cleaned;
  }
  return data;
}

// --- 2. AUDIO REACTIVITY ---

/**
 * Event listeners ensure the UI is reactive. 
 * The icon updates automatically based on what the audio element is actually doing.
 */
currentAudio.addEventListener('play', () => {
  const icon = document.getElementById('playIcon');
  if (icon) icon.setAttribute('name', 'pause-outline');
  const status = document.getElementById('audioStatus');
  if (status) status.innerText = "تشغيل...";
});

currentAudio.addEventListener('pause', () => {
  resetAudioUI();
});

// Resets icon to Play if the source is changed mid-play
currentAudio.addEventListener('emptied', () => {
  resetAudioUI();
});

currentAudio.onended = resetAudioUI;

function resetAudioUI() {
  const icon = document.getElementById('playIcon');
  if (icon) icon.setAttribute('name', 'play-outline');
  const status = document.getElementById('audioStatus');
  if (status) status.innerText = "استماع";
}

// --- 3. INITIALIZATION & FETCHING ---

async function fetchDailyVerseKey() {
  try {
    const { data, error } = await sbClient
      .from('site_config')
      .select('verse_key')
      .eq('id', 'daily_verse')
      .maybeSingle();
    return (error || !data) ? "2:255" : data.verse_key;
  } catch (e) { return "2:255"; }
}

async function fetchVerseNote(verseKey) {
  const notePanel = document.getElementById('notePanel');
  const noteContent = document.getElementById('noteContent');
  if (!notePanel || !noteContent) return;

  try {
    const { data } = await sbClient
      .from('verse_notes')
      .select('note_text')
      .eq('verse_key', verseKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.note_text?.trim()) {
      noteContent.innerText = applyHamzaFilter(data.note_text);
      notePanel.classList.remove('hidden');
    } else {
      notePanel.classList.add('hidden');
    }
  } catch (e) { notePanel.classList.add('hidden'); }
}

async function initSurahData() {
  try {
    const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
    const data = await res.json();
    allSurahs = applyHamzaFilter(data.chapters);

    const otaKey = await fetchDailyVerseKey();
    await setMode('daily', otaKey);
    renderIndex();
  } catch (e) { showToast("خطأ في تحميل البيانات"); }
}

// --- 4. NAVIGATION & MODE ---

async function setMode(mode, otaKey = null) {
  const toggleBg = document.getElementById('toggleBg');
  const btnDaily = document.getElementById('btn-daily');
  const btnRandom = document.getElementById('btn-random');

  if (mode === 'daily') {
    isRandomMode = false;
    if (toggleBg) { toggleBg.style.right = '4px'; toggleBg.style.left = 'auto'; }
    btnDaily?.classList.replace('text-slate-500', 'text-white');
    btnRandom?.classList.replace('text-white', 'text-slate-500');
    const key = otaKey || await fetchDailyVerseKey();
    fetchVerseByKey(key);
  } else {
    isRandomMode = true;
    if (toggleBg) toggleBg.style.right = '50%';
    btnRandom?.classList.replace('text-slate-500', 'text-white');
    btnDaily?.classList.replace('text-white', 'text-slate-500');
    generateNewVerse();
  }
}

function fetchVerseByKey(verseKey) {
  const verseEl = document.getElementById('verse');
  const chapterEl = document.getElementById('chapter');

  verseEl.style.opacity = '0.3';
  document.getElementById('tafsirPanel').classList.add('hidden');
  currentAudio.pause();

  fetch(`https://api.quran.com/api/v4/verses/by_key/${verseKey}?fields=text_uthmani`)
    .then(res => res.json())
    .then(data => {
      const filteredData = applyHamzaFilter(data);
      const verse = filteredData.verse;

      currentVerseKey = verse.verse_key;
      const [surahNum, verseNum] = currentVerseKey.split(':');
      currentSurahNumber = surahNum;

      verseEl.innerHTML = `﴿ ${verse.text_uthmani} ﴾`;
      verseEl.style.opacity = '1';

      const chapterObj = allSurahs.find(c => c.id == surahNum);
      if (chapterObj && chapterEl) {
        chapterEl.innerHTML = `سورة ${chapterObj.name_arabic} : آية ${verseNum}`;
      }

      loadRecitation();
      fetchVerseNote(currentVerseKey);
    });
}

function generateNewVerse() {
  fetch('https://api.quran.com/api/v4/verses/random')
    .then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key))
    .catch(() => showToast("تعذر جلب آية عشوائية"));
}

// --- 5. INDEX & SEARCH ---

function renderIndex() {
  const grid = document.getElementById('indexGrid');
  if (!grid) return;
  const query = document.getElementById('indexSearch').value.toLowerCase();
  const filtered = allSurahs.filter(s =>
    s.name_arabic.includes(query) || s.name_simple.toLowerCase().includes(query) || s.id.toString() === query
  );

  grid.innerHTML = filtered.map(s => `
    <div onclick="selectFromIndex(${s.id})" class="bg-[#162927] border border-teal-900/50 p-4 rounded-2xl hover:border-teal-400 hover:bg-teal-900/30 cursor-pointer transition-all">
        <div class="flex justify-between items-start mb-2">
            <span class="text-teal-600 text-xs font-bold">#${s.id}</span>
            <span class="text-slate-500 text-[10px]">${s.verses_count} آية</span>
        </div>
        <div class="text-center">
            <h3 class="text-xl font-['Amiri']">${s.name_arabic}</h3>
            <p class="text-slate-500 text-xs mt-1 uppercase tracking-tighter">${s.name_simple}</p>
        </div>
    </div>`).join('');
}

function openIndex() {
  const modal = document.getElementById('indexModal');
  modal.classList.replace('hidden', 'flex');
  document.body.style.overflow = 'hidden';
  setTimeout(() => modal.classList.add('active'), 10);
  renderIndex();
}

function closeIndex() {
  const modal = document.getElementById('indexModal');
  modal.classList.remove('active');
  document.body.style.overflow = 'auto';
  setTimeout(() => modal.classList.replace('flex', 'hidden'), 300);
}

function selectFromIndex(surahId) {
  window.location.href = `build/html/surah.html?surah=${surahId}`;
}

// --- 6. AUDIO & TAFSIR ---

function loadRecitation() {
  const status = document.getElementById('audioStatus');
  const reciterId = document.getElementById('reciterSelect').value;
  if (status) status.innerText = "جاري...";
  if (!currentVerseKey) return;

  const [s, a] = currentVerseKey.split(':');
  currentAudio.src = `https://everyayah.com/data/${reciterId}/${s.padStart(3, '0')}${a.padStart(3, '0')}.mp3`;
  currentAudio.oncanplaythrough = () => { if (status) status.innerText = "استماع"; };
  currentAudio.load();
}

function toggleAudio() {
  currentAudio.paused ? currentAudio.play() : currentAudio.pause();
}

function toggleTafsir() {
  const panel = document.getElementById('tafsirPanel');
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  const content = document.getElementById('tafsirContent');
  content.innerText = "جاري التحميل...";
  panel.classList.remove('hidden');

  fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah/${currentVerseKey}`)
    .then(res => res.json())
    .then(data => {
      content.innerText = applyHamzaFilter(data).tafsir.text.replace(/<[^>]*>?/gm, '');
    });
}

// --- 7. SHARING (REWRITTEN) ---

async function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;
  const modal = document.getElementById('shareModal');
  const preview = document.getElementById('previewImage');

  if (!verseText) return showToast("لا توجد آية للمشاركة");

  canvas.width = 1080; canvas.height = 1080;
  ctx.fillStyle = '#0f1c1b';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#2dd4bf33';
  ctx.lineWidth = 40;
  ctx.strokeRect(20, 20, 1040, 1040);

  let fontSize = 65;
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = 'white'; ctx.font = `bold ${fontSize}px "Amiri", serif`;

  let lines = [], words = verseText.split(' '), currentLine = '', maxWidth = 880;
  words.forEach(word => {
    let testLine = currentLine + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine); currentLine = word + ' ';
    } else { currentLine = testLine; }
  });
  lines.push(currentLine);

  let lineHeight = fontSize * 1.6;
  let y = (1080 / 2) - ((lines.length * lineHeight) / 2) + fontSize;
  lines.forEach(line => { ctx.fillText(line, 540, y); y += lineHeight; });

  ctx.fillStyle = '#2dd4bf'; ctx.font = '45px "Amiri", serif';
  ctx.fillText(chapterText, 540, y + 80);

  preview.src = canvas.toDataURL('image/png');
  modal.classList.replace('hidden', 'flex');
  setTimeout(() => modal.classList.add('active'), 10);
}

async function copyImageToClipboard() {
  const canvas = document.getElementById('shareCanvas');
  try {
    canvas.toBlob(async (blob) => {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      showToast("✅ تم نسخ الصورة بنجاح");
    });
  } catch (err) { showToast("❌ فشل النسخ"); }
}

async function shareTo(platform) {
  const canvas = document.getElementById('shareCanvas');
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'yatlo-verse.png', { type: 'image/png' });

  if (platform === 'whatsapp' || platform === 'facebook') {
    if (navigator.share) {
      navigator.share({ files: [file] }).catch(() => { });
    } else {
      showToast("يرجى حفظ الصورة لمشاركتها");
    }
  }
}

function closeModal() {
  const modal = document.getElementById('shareModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.replace('flex', 'hidden'), 300);
}

// --- 8. UTILS & ADMIN ---

function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').innerText = message;
  toast.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

// Admin Long-Press (5 seconds)
let pressTimer;
const adminBtn = document.getElementById('btn-daily');
if (adminBtn) {
  const start = () => { pressTimer = setTimeout(() => { if (confirm("Admin Panel?")) window.location.href = 'build/html/admin.html'; }, 5000); };
  const end = () => clearTimeout(pressTimer);
  adminBtn.addEventListener('mousedown', start); adminBtn.addEventListener('mouseup', end);
  adminBtn.addEventListener('touchstart', start); adminBtn.addEventListener('touchend', end);
}

initSurahData();