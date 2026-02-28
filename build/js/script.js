/**
 * يتلو | Yatlo Quran - Unified Logic
 * Features: UI Logic, Audio, Search, Tafsir, and Mobile-Optimized Native Sharing.
 */

// --- CONFIGURATION ---
// const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
// const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';
// const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL STATE ---
let currentSurahNumber = null;
let currentVerseKey = null;
let currentAudio = new Audio();
let allSurahs = [];
let isRandomMode = false;
let cachedFile = null; // Essential for bypassing mobile security blocks
const TOTAL_QURAN_VERSES = 6236;

/**
 * Applies global Hamza override filter.
 */
function safeFilter(data) {
  if (window.safeFilter) return window.safeFilter(data);
  return typeof data === 'string' ? data.replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي') : data;
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
    const { data } = await sbClient.from('verse_notes').select('note_text').eq('verse_key', verseKey).maybeSingle();
    if (data?.note_text?.trim()) {
      noteContent.innerHTML = `
                <div class="lesson-container fade-in">
                    <span class="lesson-title">هدايات الآية:</span>
                    <p class="lesson-text">${safeFilter(data.note_text)}</p>
                </div>
            `;
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
    allSurahs = data.chapters;
    window.allSurahs = allSurahs;

    const urlParams = new URLSearchParams(window.location.search);
    const verseParam = urlParams.get('verse');

    if (verseParam) {
      fetchVerseByKey(verseParam);
    } else {
      const dailyKey = await fetchDailyVerseKey();
      await setMode('daily', dailyKey);
    }
  } catch (e) { console.error("Data load error"); }
}

// --- 3. SEARCH & NAVIGATION ---

function handleSurahKey(event) {
  if (event.key === 'Enter') {
    const query = event.target.value.trim();
    if (!query) return;
    const match = allSurahs.find(s =>
      s.name_arabic.includes(query) ||
      s.name_simple.toLowerCase().includes(query.toLowerCase()) ||
      s.id.toString() === query
    );
    if (match) selectSurah(match.name_arabic, match.id);
  }
}

function handleAyahKey(event) {
  if (event.key === 'Enter') searchVerse();
}

function filterSurahs() {
  const query = document.getElementById('surahSearch')?.value.trim().toLowerCase();
  const list = document.getElementById('surahList');
  if (!query || !list) { list?.classList.add('hidden'); return; }

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
  if (searchInput) searchInput.value = name;
  if (hiddenInput) hiddenInput.value = id;
  currentSurahNumber = id;
  document.getElementById('surahList')?.classList.add('hidden');
  setTimeout(() => document.getElementById('ayahInput')?.focus(), 50);
}

function searchVerse() {
  const surahId = document.getElementById('surahInput')?.value;
  const ayahId = document.getElementById('ayahInput')?.value;
  if (!surahId || !ayahId) return;
  fetchVerseByKey(`${surahId}:${ayahId}`);
  if (window.closeIndex) window.closeIndex();
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
      const verse = data.verse;
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
      cachedFile = null; // Clear old file cache
    })
    .catch(() => console.error("Failed to load verse"));
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
    if (toggleBg) { toggleBg.style.right = '50%'; toggleBg.style.left = 'auto'; }
    generateNewVerse();
  }
}

function generateNewVerse() {
  fetch('https://api.quran.com/api/v4/verses/random')
    .then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key));
}

function loadRecitation() {
  const select = document.getElementById('reciterSelect');
  if (!select || !currentVerseKey) return;
  const reciterId = select.value;
  const [s, a] = currentVerseKey.split(':');
  currentAudio.src = `https://everyayah.com/data/${reciterId}/${s.padStart(3, '0')}${a.padStart(3, '0')}.mp3`;
}

function toggleAudio() {
  currentAudio.paused ? currentAudio.play() : currentAudio.pause();
}

async function toggleTafsir() {
  const panel = document.getElementById('tafsirPanel');
  const content = document.getElementById('tafsirContent');
  if (!panel || !content) return;

  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }

  content.innerText = "جاري تحميل التفسير...";
  panel.classList.remove('hidden');

  try {
    const response = await fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah/${currentVerseKey}`);
    const data = await response.json();
    if (data.tafsir && data.tafsir.text) {
      content.innerText = data.tafsir.text.replace(/<\/?[^>]+(>|$)/g, "");
    } else {
      content.innerText = "التفسير غير متوفر حالياً.";
    }
  } catch (error) { content.innerText = "خطأ في الاتصال."; }
}

// --- 6. SHARING & CANVAS (MOBILE SECURITY FIXED) ---

async function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const modal = document.getElementById('shareModal');
  const preview = document.getElementById('previewImage');
  if (!canvas || !modal) return;

  await document.fonts.ready;
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;

  // 1. Render Canvas
  canvas.width = 1080; canvas.height = 1080;
  const grad = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
  grad.addColorStop(0, '#152422'); grad.addColorStop(1, '#0b1211');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 10; ctx.strokeRect(30, 30, 1020, 1020);

  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = '#2dd4bf'; ctx.font = '42px "Amiri", serif';
  ctx.fillText(chapterText, 540, 120);

  ctx.fillStyle = 'white';
  let fontSize = 68;
  ctx.font = `bold ${fontSize}px "Amiri", serif`;
  let words = verseText.split(' '), lines = [], line = '';
  words.forEach(w => {
    if (ctx.measureText(line + w).width > 880) { lines.push(line.trim()); line = w + ' '; }
    else { line += w + ' '; }
  });
  lines.push(line.trim());
  let y = 540 - (lines.length * fontSize * 0.8) + fontSize;
  lines.forEach(l => { ctx.fillText(l, 540, y); y += fontSize * 1.6; });

  ctx.fillStyle = '#2dd4bf'; ctx.font = '30px "Rakkas", serif';
  ctx.fillText('تطبيق يتلو | Yatlo Quran', 540, 1030);

  // 2. CRITICAL MOBILE FIX: Pre-cache as File immediately
  preview.src = canvas.toDataURL('image/png', 0.8);
  canvas.toBlob(blob => {
    cachedFile = new File([blob], `Ayah-${currentVerseKey}.png`, { type: "image/png" });
  }, 'image/png');

  modal.classList.replace('hidden', 'flex');
  setTimeout(() => modal.classList.add('active'), 50);
}

function shareTo(platform) {
  if (platform === 'copy') {
    copyImageToClipboard();
  } else {
    nativeShare();
  }
}

async function nativeShare() {
  if (!cachedFile) return;

  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [cachedFile] })) {
      await navigator.share({
        files: [cachedFile],
        title: 'آية من تطبيق يتلو',
        text: 'تدبر قوله تعالى'
      });
    } else {
      // Fallback for non-supporting browsers: Trigger Copy
      copyImageToClipboard();
    }
  } catch (err) { console.error("Native share cancelled or failed"); }
}

async function copyImageToClipboard() {
  if (!cachedFile) return;
  try {
    const data = [new ClipboardItem({ [cachedFile.type]: cachedFile })];
    await navigator.clipboard.write(data);
    if (window.showToast) window.showToast("✅ تم نسخ الصورة");
  } catch (err) {
    if (window.showToast) window.showToast("❌ اضغط مطولاً على الصورة للحفظ");
  }
}

function closeModal() {
  const modal = document.getElementById('shareModal');
  if (!modal) return;
  modal.classList.remove('active');
  setTimeout(() => modal.classList.replace('flex', 'hidden'), 300);
}

// --- INITIALIZATION ---
async function startApp() {
  initSurahData();
  setTimeout(() => { if (window.checkActiveKhatma) window.checkActiveKhatma(); }, 1500);
}

window.onload = startApp;
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-random')?.addEventListener('click', () => setMode('random'));
  document.getElementById('btn-daily')?.addEventListener('click', () => setMode('daily'));
  document.getElementById('surahSearch')?.addEventListener('input', filterSurahs);
});