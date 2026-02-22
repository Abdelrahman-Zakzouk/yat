/**
 * يتلو | Yatlo Quran - Unified Logic
 * Features: Hamza Filtering, Dynamic Canvas Scaling, Audio, and Search.
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

/**
 * Applies global Hamza override filter to data strings.
 * Note: This uses the override list remembered for hamza mistypes.
 */
function safeFilter(data) {
  return (typeof applyHamzaFilter === 'function') ? applyHamzaFilter(data) : data;
}

// --- 1. AUDIO REACTIVITY ---
currentAudio.addEventListener('play', () => {
  const icon = document.getElementById('playIcon');
  if (icon) icon.setAttribute('name', 'pause-outline');
  const status = document.getElementById('audioStatus');
  if (status) status.innerText = "تشغيل...";
});

currentAudio.addEventListener('pause', resetAudioUI);
currentAudio.addEventListener('emptied', resetAudioUI);
currentAudio.onended = resetAudioUI;

function resetAudioUI() {
  const icon = document.getElementById('playIcon');
  if (icon) icon.setAttribute('name', 'play-outline');
  const status = document.getElementById('audioStatus');
  if (status) status.innerText = "استماع";
}

// --- 2. INITIALIZATION & DATA ---

async function fetchDailyVerseKey() {
  try {
    const { data, error } = await sbClient.from('site_config').select('verse_key').eq('id', 'daily_verse').maybeSingle();
    return (error || !data) ? "2:255" : data.verse_key;
  } catch (e) { return "2:255"; }
}

async function fetchVerseNote(verseKey) {
  const notePanel = document.getElementById('notePanel');
  const noteContent = document.getElementById('noteContent');
  if (!notePanel || !noteContent) return;
  try {
    const { data } = await sbClient.from('verse_notes').select('note_text').eq('verse_key', verseKey).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data?.note_text?.trim()) {
      noteContent.innerText = safeFilter(data.note_text);
      notePanel.classList.remove('hidden');
    } else { notePanel.classList.add('hidden'); }
  } catch (e) { notePanel.classList.add('hidden'); }
}

async function initSurahData() {
  try {
    const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
    const data = await res.json();
    allSurahs = safeFilter(data.chapters);
    const otaKey = await fetchDailyVerseKey();
    await setMode('daily', otaKey);
    renderIndex();
  } catch (e) { showToast("خطأ في تحميل البيانات"); }
}

// --- 3. SEARCH & FULL SURAH NAVIGATION ---

/**
 * Handles Enter key on Surah input: picks best match and moves to Ayah.
 */
function handleSurahKey(event) {
  if (event.key === 'Enter') {
    const query = event.target.value.trim();
    if (!query) return;

    // Find the best match from our current surah list
    const match = allSurahs.find(s =>
      s.name_arabic.includes(query) ||
      s.name_simple.toLowerCase().includes(query) ||
      s.id.toString() === query
    );

    if (match) {
      selectSurah(match.name_arabic, match.id);
    } else {
      showToast("⚠️ لم يتم العثور على السورة");
    }
  }
}

/**
 * Handles Enter key on Ayah input: validates and submits search.
 */
function handleAyahKey(event) {
  if (event.key === 'Enter') {
    const ayahVal = event.target.value.trim();
    if (!ayahVal || parseInt(ayahVal) <= 0) {
      showToast("⚠️ يرجى إدخال رقم آية صحيح");
      return;
    }
    searchVerse();
  }
}

// Handles browser history or clicking away for Surah names
function handleAutofill(event) {
  const query = event.target.value.trim();
  if (!query) return;

  const match = allSurahs.find(s =>
    s.name_arabic === query ||
    s.name_simple.toLowerCase() === query
  );

  if (match) {
    selectSurah(match.name_arabic, match.id);
  }
}

function filterSurahs() {
  const query = document.getElementById('surahSearch')?.value.trim().toLowerCase();
  const list = document.getElementById('surahList');
  if (!query || !list) {
    list?.classList.add('hidden');
    return;
  }

  const matches = allSurahs.filter(s =>
    s.name_arabic.includes(query) ||
    s.name_simple.toLowerCase().includes(query) ||
    s.id.toString() === query
  ).slice(0, 10);

  if (matches.length > 0) {
    list.innerHTML = matches.map(s => `
      <div onclick="selectSurah('${s.name_arabic}', ${s.id})" 
           class="p-3 hover:bg-teal-800/50 cursor-pointer border-b border-teal-900/30 text-right text-sm text-white">
        ${s.name_arabic} <span class="text-teal-600 text-xs">#${s.id}</span>
      </div>`).join('');
    list.classList.remove('hidden');
  } else {
    list.classList.add('hidden');
  }
}

function selectSurah(name, id) {
  const searchInput = document.getElementById('surahSearch');
  const hiddenInput = document.getElementById('surahInput');
  const ayahInput = document.getElementById('ayahInput');

  if (searchInput) searchInput.value = name;
  if (hiddenInput) hiddenInput.value = id;

  document.getElementById('surahList')?.classList.add('hidden');

  // Shift focus to Ayah input after valid selection
  if (ayahInput) {
    setTimeout(() => ayahInput.focus(), 50);
  }
}

function searchVerse() {
  const surahId = document.getElementById('surahInput')?.value;
  const ayahId = document.getElementById('ayahInput')?.value;

  if (!surahId) return showToast("⚠️ اختر السورة أولاً");
  if (!ayahId) return showToast("⚠️ اختر الآية أولاً");

  fetchVerseByKey(`${surahId}:${ayahId}`);
  closeIndex();
}

// --- 4. CORE FETCHING ---

function fetchVerseByKey(verseKey) {
  const verseEl = document.getElementById('verse');
  const chapterEl = document.getElementById('chapter');
  if (!verseEl) return;

  verseEl.style.opacity = '0.3';
  document.getElementById('tafsirPanel')?.classList.add('hidden');
  currentAudio.pause();

  fetch(`https://api.quran.com/api/v4/verses/by_key/${verseKey}?fields=text_uthmani`)
    .then(res => res.json())
    .then(data => {
      const filteredData = safeFilter(data);
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
    })
    .catch(() => showToast("تعذر تحميل الآية"));
}

// --- 5. AUDIO & TAFSIR & MODE ---

async function setMode(mode, otaKey = null) {
  const toggleBg = document.getElementById('toggleBg');
  if (mode === 'daily') {
    isRandomMode = false;
    if (toggleBg) { toggleBg.style.right = '4px'; toggleBg.style.left = 'auto'; }
    const key = otaKey || await fetchDailyVerseKey();
    fetchVerseByKey(key);
  } else {
    isRandomMode = true;
    if (toggleBg) toggleBg.style.right = '50%';
    generateNewVerse();
  }
}

function generateNewVerse() {
  fetch('https://api.quran.com/api/v4/verses/random')
    .then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key));
}

function loadRecitation() {
  const reciterId = document.getElementById('reciterSelect').value;
  if (!currentVerseKey) return;
  const [s, a] = currentVerseKey.split(':');
  currentAudio.src = `https://everyayah.com/data/${reciterId}/${s.padStart(3, '0')}${a.padStart(3, '0')}.mp3`;
}

function toggleAudio() {
  currentAudio.paused ? currentAudio.play() : currentAudio.pause();
}

function toggleTafsir() {
  const panel = document.getElementById('tafsirPanel');
  if (!panel) return;
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }

  const content = document.getElementById('tafsirContent');
  content.innerText = "جاري التحميل...";
  panel.classList.remove('hidden');

  fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah/${currentVerseKey}`)
    .then(res => res.json())
    .then(data => {
      content.innerText = safeFilter(data).tafsir.text.replace(/<[^>]*>?/gm, '');
    });
}

// --- 6. SHARING & CANVAS (Visual Match Update) ---

async function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;
  const modal = document.getElementById('shareModal');
  const preview = document.getElementById('previewImage');

  canvas.width = 1080; canvas.height = 1080;

  // 1. BACKGROUND: Radial Gradient
  const gradient = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
  gradient.addColorStop(0, '#152422');
  gradient.addColorStop(1, '#0b1211');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);

  // 2. THE ROUNDED OUTLINE (10px thickness, 10px radius)
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(30, 30, 1020, 1020, 10);
  ctx.stroke();

  ctx.textAlign = 'center'; ctx.direction = 'rtl';

  // 3. CHAPTER & VERSE (Top Position - Rakkas Font)
  ctx.fillStyle = '#2dd4bf';
  ctx.font = '42px "Amiri", serif';
  ctx.fillText(chapterText, 540, 120);

  // 4. DYNAMIC TEXT SCALING FOR VERSE
  ctx.fillStyle = 'white';

  let fontSize = 68;
  let lines = [];
  const maxWidth = 880;
  const maxHeight = 700; // Constrained space to avoid overlapping footer

  while (fontSize > 18) {
    ctx.font = `bold ${fontSize}px "Amiri", serif`;
    let currentLineHeight = fontSize * 1.5; // Proportional scaling
    lines = [];
    let words = verseText.split(' ');
    let currentLine = '';

    words.forEach(word => {
      let testLine = currentLine + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    });
    lines.push(currentLine.trim());

    if (lines.length * currentLineHeight <= maxHeight) break;
    fontSize -= 2;
  }

  const finalLineHeight = fontSize * 1.5;
  // Calculate balanced starting Y position
  let y = 180 + (maxHeight - (lines.length * finalLineHeight)) / 2 + (finalLineHeight / 1.2);

  ctx.font = `bold ${fontSize}px "Amiri", serif`;
  lines.forEach(line => {
    ctx.fillText(line, 540, y);
    y += finalLineHeight;
  });

  // 5. BRANDING FOOTER (Bottom Position - Rakkas Font)
  ctx.fillStyle = '#2dd4bf';
  ctx.font = '30px "Rakkas", serif';
  ctx.fillText('تطبيق يتلو | Yatlo Quran', 540, 1030);

  preview.src = canvas.toDataURL('image/png');
  modal.classList.replace('hidden', 'flex');
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeModal() {
  const modal = document.getElementById('shareModal');
  if (!modal) return;
  modal.classList.remove('active');
  setTimeout(() => modal.classList.replace('flex', 'hidden'), 300);
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
  if (navigator.share) {
    navigator.share({ files: [file] }).catch(() => { });
  } else { showToast("يرجى حفظ الصورة لمشاركتها"); }
}

// --- 7. UTILS & INDEX ---

function renderIndex() {
  const grid = document.getElementById('indexGrid');
  if (!grid) return;
  const query = document.getElementById('indexSearch')?.value.toLowerCase() || "";
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
  window.location.href = `build/html/surah.html?surah=${surahId}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;
  msgEl.innerText = message;
  toast.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

// Start app
initSurahData();