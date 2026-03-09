/**
 * بياني | Bayani Quran - Unified Logic
 * Features: UI Logic, Audio, Search, Tafsir, and Mobile-Optimized Native Sharing.
 */

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
    try { await window.getSupabaseClient(); } catch (e) { }
    const client = window.sbClient || window.sb || window.supabaseClient;
    if (!client) return "2:255";
    const { data, error } = await client.from('site_config').select('verse_key').eq('id', 'daily_verse').maybeSingle();
    return (error || !data) ? "2:255" : data.verse_key;
  } catch (e) { return "2:255"; }
}

async function fetchVerseNote(verseKey) {
  const notePanel = document.getElementById('notePanel');
  const noteContent = document.getElementById('noteContent');
  if (!notePanel || !noteContent) return;

  try {
    try { await window.getSupabaseClient(); } catch (e) { }
    const client = window.sbClient || window.sb || window.supabaseClient;

    if (!client) {
      notePanel.classList.add('hidden');
      return;
    }

    const { data, error } = await client
      .from('verse_notes')
      .select('note_text')
      .eq('verse_key', verseKey)
      .maybeSingle();

    if (error) throw error;

    if (data?.note_text?.trim()) {
      noteContent.innerHTML = `
        <div class="lesson-container fade-in">
          <span class="lesson-title text-teal-400 font-bold block mb-2">هدايات الآية:</span>
          <p class="lesson-text text-slate-300 leading-relaxed">${data.note_text}</p>
        </div>
      `;
      notePanel.classList.remove('hidden');
    } else {
      notePanel.classList.add('hidden');
    }
  } catch (e) {
    console.error("Verse Note Error:", e);
    notePanel.classList.add('hidden');
  }
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

/**
 * Redirects to the main Quran reader (khatma.html) at the specific Surah
 */
function goToSurah() {
  if (currentSurahNumber) {
    window.location.href = `/build/html/khatma.html?surah=${currentSurahNumber}`;
  } else {
    window.location.href = `/build/html/khatma.html`;
  }
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
      currentSurahNumber = surahNum; // Update global state for goToSurah()

      verseEl.innerHTML = `﴿ ${verse.text_uthmani} ﴾`;
      verseEl.style.opacity = '1';

      const chapterObj = allSurahs.find(c => c.id == surahNum);
      if (chapterObj && chapterEl) {
        chapterEl.innerHTML = `سورة ${chapterObj.name_arabic} : آية ${verseNum}`;
      }
      loadRecitation();
      fetchVerseNote(currentVerseKey);
      cachedFile = null;
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

// --- 6. SHARING & CANVAS ---

async function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const modal = document.getElementById('shareModal');
  const preview = document.getElementById('previewImage');
  if (!canvas || !modal) return;

  // 1. Wait for fonts and get content
  await document.fonts.ready;
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;

  // 2. Setup Canvas Background
  canvas.width = 1080;
  canvas.height = 1080;
  const grad = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
  grad.addColorStop(0, '#152422');
  grad.addColorStop(1, '#0b1211');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  // 3. Draw Decorative Border
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, 1020, 1020);

  // 4. Draw Header (Chapter/Verse info)
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#2dd4bf';
  ctx.font = '42px "Amiri", serif';
  ctx.fillText(chapterText, 540, 120);

  // 5. Dynamic Verse Scaling Logic
  let fontSize = 68; // Ideal starting size
  let lines = [];
  const maxTextHeight = 720; // Maximum vertical box for the verse
  const maxWidth = 880;      // Maximum width per line

  // Helper to wrap text and calculate total height
  const getLayout = (size) => {
    ctx.font = `bold ${size}px "Amiri", serif`;
    let words = verseText.split(' '), tempLines = [], currentLine = '';

    words.forEach(w => {
      let testLine = currentLine + w + ' ';
      if (ctx.measureText(testLine).width > maxWidth) {
        tempLines.push(currentLine.trim());
        currentLine = w + ' ';
      } else {
        currentLine = testLine;
      }
    });
    tempLines.push(currentLine.trim());
    return {
      lines: tempLines,
      totalHeight: tempLines.length * (size * 1.5) // 1.5 is the line-height ratio
    };
  };

  // Shrink loop: reduce font size until it fits the box
  let layout = getLayout(fontSize);
  while (layout.totalHeight > maxTextHeight && fontSize > 28) {
    fontSize -= 3;
    layout = getLayout(fontSize);
  }

  // 6. Draw the Verse Text (Vertically Centered)
  ctx.fillStyle = 'white';
  ctx.font = `bold ${fontSize}px "Amiri", serif`;

  // Calculate starting Y to keep the block centered in the available space
  let currentY = 540 - (layout.totalHeight / 2) + fontSize;

  layout.lines.forEach(l => {
    ctx.fillText(l, 540, currentY);
    currentY += fontSize * 1.5;
  });

  // 7. Draw Footer
  ctx.fillStyle = '#2dd4bf';
  ctx.font = '30px "Rakkas", serif';
  ctx.fillText('تطبيق بياني | Bayani Quran', 540, 1030);

  // 8. Generate Preview and Blob
  preview.src = canvas.toDataURL('image/png', 0.8);
  canvas.toBlob(blob => {
    cachedFile = new File([blob], `Ayah-${currentVerseKey}.png`, { type: "image/png" });
  }, 'image/png');

  // 9. Show Modal
  modal.classList.replace('hidden', 'flex');
  setTimeout(() => modal.classList.add('active'), 50);
}

async function nativeShare() {
  if (!cachedFile) return;
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [cachedFile] })) {
      await navigator.share({
        files: [cachedFile],
        title: 'آية من تطبيق بياني',
        text: 'تدبر قوله تعالى'
      });
    } else {
      copyImageToClipboard();
    }
  } catch (err) { console.error("Native share failed"); }
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