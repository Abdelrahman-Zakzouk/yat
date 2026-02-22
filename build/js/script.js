let currentSurahNumber = null;
let currentVerseKey = null;
let currentAudio = new Audio();
let allSurahs = [];
let isRandomMode = false;

// Global Override List for Hamza corrections
const HAMZA_OVERRIDES = {
  "النبإ": "النبأ",
  "سبإ": "سبأ",
  "الانسان": "الإنسان",
  "الإنفطار": "الانفطار",
  "الإنشقاق": "الانشقاق",
};

/**
 * Global filter function - This is the "Engine"
 */
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

const DAILY_VERSES = {
  "2026-02-21": "2:255",
  "2026-02-22": "24:35",
};

// --- 1. INITIALIZATION ---
async function initSurahData() {
  try {
    const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
    const data = await res.json();
    // CALL FILTER HERE: Fixes Surah names in the index/search
    allSurahs = applyHamzaFilter(data.chapters);

    setMode('daily');
  } catch (e) {
    console.error("Error loading Surahs", e);
    showToast("خطأ في الاتصال بالخادم");
  }
}

// --- MODE TOGGLING ---
// build/js/script.js

/**
 * Handles the main dashboard toggle between Daily and Random modes
 */
function setMode(mode) {
  const toggleBg = document.getElementById('toggleBg');
  const btnDaily = document.getElementById('btn-daily');
  const btnRandom = document.getElementById('btn-random');

  if (mode === 'daily') {
    isRandomMode = false;
    toggleBg.style.right = '4px';
    toggleBg.style.left = 'auto'; // Reset left

    // UI Colors
    btnDaily.classList.replace('text-slate-500', 'text-white');
    btnRandom.classList.replace('text-white', 'text-slate-500');

    fetchVerseByKey(getDailyVerseKey());
  } else {
    isRandomMode = true;
    toggleBg.style.right = '50%';

    // UI Colors
    btnRandom.classList.replace('text-slate-500', 'text-white');
    btnDaily.classList.replace('text-white', 'text-slate-500');

    generateNewVerse();
  }
}

/**
 * Handles the "Another Verse" button and Random mode logic
 */
function generateNewVerse() {
  // If user clicks "Another Verse" while in Daily mode, switch them to Random mode
  if (!isRandomMode) {
    setMode('random');
    return;
  }

  // Actually fetch a random verse
  fetch('https://api.quran.com/api/v4/verses/random')
    .then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key))
    .catch(err => showToast("تعذر جلب آية عشوائية"));
}
function getDailyVerseKey() {
  const today = new Date().toISOString().split('T')[0];
  return DAILY_VERSES[today] || "2:255";
}

// --- SURAH INDEX LOGIC ---
// build/js/script.js

function openIndex() {
  const modal = document.getElementById('indexModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Prevent background scrolling
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
  renderIndex();
}

function closeIndex() {
  const modal = document.getElementById('indexModal');
  modal.classList.remove('active');

  // Restore scrolling
  document.body.style.overflow = 'auto';

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 300);
}

function renderIndex() {
  const grid = document.getElementById('indexGrid');
  const query = document.getElementById('indexSearch').value.toLowerCase();

  const filtered = allSurahs.filter(s =>
    s.name_arabic.includes(query) ||
    s.name_simple.toLowerCase().includes(query)
  );

  grid.innerHTML = filtered.map(s => `
        <div onclick="selectFromIndex(${s.id})" 
             class="bg-[#162927] border border-teal-900/50 p-4 rounded-2xl hover:border-teal-400 hover:bg-teal-900/30 cursor-pointer transition-all group">
            <div class="flex justify-between items-start mb-2">
                <span class="text-teal-600 text-xs font-bold">#${s.id}</span>
                <span class="text-slate-500 text-[10px]">${s.verses_count} آية</span>
            </div>
            <div class="text-center">
                <h3 class="text-xl font-['Amiri'] group-hover:text-teal-400 transition-colors">${s.name_arabic}</h3>
                <p class="text-slate-500 text-xs mt-1 uppercase tracking-tighter">${s.name_simple}</p>
            </div>
        </div>
    `).join('');
}

// Inside build/js/script.js

function selectFromIndex(surahId) {
  // Redirect to the surah page inside the html folder
  // We use build/html/ because index.html is in the root
  window.location.href = `build/html/surah.html?surah=${surahId}`;
}

// --- 2. SEARCH & NAVIGATION ---
function filterSurahs() {
  const query = document.getElementById('surahSearch').value.trim();
  const list = document.getElementById('surahList');
  if (query.length < 1) { list.classList.add('hidden'); return; }

  const matches = allSurahs.filter(s =>
    s.name_arabic.includes(query) || s.name_simple.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  if (matches.length > 0) {
    list.innerHTML = matches.map(s => `
      <div onclick="selectSurah('${s.name_arabic}', ${s.id})" class="p-3 hover:bg-teal-800 cursor-pointer border-b border-teal-900/30 text-right text-sm">
        ${s.name_arabic} <span class="text-teal-600 text-xs">#${s.id}</span>
      </div>`).join('');
    list.classList.remove('hidden');
  } else { list.classList.add('hidden'); }
}

function selectSurah(name, id) {
  document.getElementById('surahSearch').value = name;
  document.getElementById('surahInput').value = id;
  document.getElementById('surahList').classList.add('hidden');
}


function searchVerse() {
  // 1. Force grab and convert values to numbers for comparison
  const surahInput = document.getElementById('surahInput');
  const ayahInput = document.getElementById('ayahInput');

  const surahId = parseInt(surahInput.value);
  const ayahId = parseInt(ayahInput.value);

  // 2. Basic empty check
  if (!surahId || !ayahId) {
    showToast("⚠️ يرجى اختيار السورة والآية");
    return;
  }

  // 3. Validate Surah Range (1-114)
  if (surahId < 1 || surahId > 114) {
    showToast("❌ رقم السورة غير صحيح (1-114)");
    return;
  }

  // 4. Validate Ayah count using your global 'allSurahs' data
  // This prevents searching for Ayah 10 in a Surah that only has 7
  const chapterData = allSurahs.find(s => s.id === surahId);
  if (chapterData) {
    if (ayahId < 1 || ayahId > chapterData.verses_count) {
      showToast(`❌ سورة ${chapterData.name_arabic} بها ${chapterData.verses_count} آية فقط`);
      return;
    }
  }

  // 5. Clear focus to hide mobile keyboard
  ayahInput.blur();

  // 6. Proceed to fetch
  fetchVerseByKey(`${surahId}:${ayahId}`);
}

// --- 3. CORE FETCH LOGIC ---
function fetchVerseByKey(verseKey) {
  const verseEl = document.getElementById('verse');
  verseEl.style.opacity = '0.3';
  currentAudio.pause();
  document.getElementById('tafsirPanel').classList.add('hidden');
  resetAudioUI();

  fetch(`https://api.quran.com/api/v4/verses/by_key/${verseKey}?fields=text_uthmani`)
    .then(res => res.json())
    .then(data => {
      // CALL FILTER HERE: Fixes Hamzas in the actual Verse text
      const filteredData = applyHamzaFilter(data);
      const verse = filteredData.verse;

      currentVerseKey = verse.verse_key;
      const [surahNum, verseNum] = currentVerseKey.split(':');
      currentSurahNumber = surahNum;

      verseEl.innerHTML = `﴿ ${verse.text_uthmani} ﴾`;
      verseEl.style.opacity = '1';

      const chapterObj = allSurahs.find(c => c.id == surahNum);
      if (chapterObj) {
        document.getElementById('surahSearch').value = chapterObj.name_arabic;
        document.getElementById('surahInput').value = surahNum;
        document.getElementById('ayahInput').value = verseNum;
        document.getElementById('chapter').innerHTML = `سورة ${chapterObj.name_arabic} : آية ${verseNum}`;
      }
      loadRecitation();
    })
    .catch(err => {
      console.error("Search Error:", err);
      verseEl.style.opacity = '1';
      showToast("❌ حدث خطأ أثناء جلب الآية. تأكد من اتصالك.");
    });
}

// function generateNewVerse() {
//   if (!isRandomMode) {
//     setMode('random');
//     return;
//   }
//   fetch('https://api.quran.com/api/v4/verses/random').then(res => res.json())
//     .then(data => fetchVerseByKey(data.verse.verse_key));
// }

// --- 4. AUDIO & TAFSIR ---
function loadRecitation() {
  const status = document.getElementById('audioStatus');
  const reciterId = document.getElementById('reciterSelect').value;
  document.getElementById('audioBtn').style.display = 'flex';
  status.innerText = "جاري التحميل...";

  const [s, a] = currentVerseKey.split(':');
  currentAudio.src = `https://everyayah.com/data/${reciterId}/${s.padStart(3, '0')}${a.padStart(3, '0')}.mp3`;
  currentAudio.oncanplaythrough = () => status.innerText = "استماع";
  currentAudio.load();
}

function toggleAudio() {
  if (currentAudio.paused) {
    currentAudio.play();
    document.getElementById('playIcon').setAttribute('name', 'pause-outline');
    document.getElementById('audioStatus').innerText = "تشغيل...";
  } else {
    currentAudio.pause();
    resetAudioUI();
  }
}

function resetAudioUI() {
  document.getElementById('playIcon').setAttribute('name', 'play-outline');
  document.getElementById('audioStatus').innerText = "استماع";
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
      // CALL FILTER HERE: Fixes Hamzas in the Tafsir text
      const filteredTafsir = applyHamzaFilter(data);
      content.innerText = filteredTafsir.tafsir.text.replace(/<[^>]*>?/gm, '');
    })
    .catch(() => content.innerText = "تعذر تحميل التفسير");
}

// --- 5. IMAGE GENERATION, 6. SHARING, 7. UTILS ---
// (Keeping your exact logic for these sections below)
function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;
  canvas.width = 1080; canvas.height = 1080;
  ctx.fillStyle = '#1a2e2c'; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 20; ctx.strokeRect(40, 40, 1000, 1000);
  let fontSize = 60; let lineHeight = fontSize * 1.5; let lines = [];
  const maxWidth = 850; const maxHeight = 750;
  while (fontSize > 20) {
    ctx.font = `${fontSize}px "Amiri Quran", serif`;
    lines = []; let words = verseText.split(' '); let currentLine = '';
    words.forEach(word => {
      let testLine = currentLine + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth) { lines.push(currentLine); currentLine = word + ' '; }
      else { currentLine = testLine; }
    });
    lines.push(currentLine);
    if (lines.length * (fontSize * 1.5) <= maxHeight) break;
    fontSize -= 5; lineHeight = fontSize * 1.5;
  }
  ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
  let totalTextHeight = lines.length * lineHeight;
  let y = (1080 / 2) - (totalTextHeight / 2) + (fontSize / 2);
  lines.forEach(line => { ctx.fillText(line, 540, y); y += lineHeight; });
  ctx.fillStyle = '#2dd4bf'; ctx.font = '40px "Amiri", serif';
  ctx.fillText(chapterText, 540, y + 60);
  ctx.font = 'italic 25px "Rakkas"'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('تطبيق يتلو | Yatlo Quran', 540, 1020);
  document.getElementById('previewImage').src = canvas.toDataURL();
  const modal = document.getElementById('shareModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeModal() {
  const modal = document.getElementById('shareModal');
  modal.classList.remove('active');
  setTimeout(() => { modal.classList.remove('flex'); modal.classList.add('hidden'); }, 300);
}

// Inside build/js/script.js

function goToSurah() {
  if (currentSurahNumber) {
    // Updated path to reach the file in the new subfolder
    window.location.href = `build/html/surah.html?surah=${currentSurahNumber}`;
  } else {
    showToast("يرجى اختيار سورة أولاً");
  }
}

async function shareTo(platform) {
  const canvas = document.getElementById('shareCanvas');
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'yatlo-verse.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'آية من يتلو', text: document.getElementById('verse').innerText }); }
    catch (err) { console.log("Share canceled"); }
  } else {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast("تم نسخ الصورة! قم باللصق في التطبيق");
      if (platform === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(document.getElementById('chapter').innerText)}`, '_blank'); }
    } catch (err) { downloadFromPreview(); showToast("تم تحميل الصورة للمشاركة يدوياً"); }
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  msgEl.innerText = message;
  toast.classList.remove('opacity-0'); toast.classList.add('opacity-100');
  setTimeout(() => { toast.classList.remove('opacity-100'); toast.classList.add('opacity-0'); }, 3000);
}

function downloadFromPreview() {
  const a = document.createElement('a'); a.download = 'yatlo_verse.png';
  a.href = document.getElementById('previewImage').src; a.click();
}

document.addEventListener('click', e => {
  if (!e.target.closest('#surahSearch')) document.getElementById('surahList').classList.add('hidden');
});
currentAudio.onended = resetAudioUI;

initSurahData();
// Add this to your initSurahData or at the bottom of script.js
document.getElementById('ayahInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    searchVerse();
  }
});

