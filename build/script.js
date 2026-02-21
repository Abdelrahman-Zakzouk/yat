let currentSurahNumber = null;
let currentVerseKey = null;
let currentAudio = new Audio();
let allSurahs = [];
let isRandomMode = false;

// 1. MANAGE DAILY VERSES (Update this list manually)
const DAILY_VERSES = {
  "2026-02-21": "2:255", // Today
  "2026-02-22": "24:35", // Tomorrow
};

// --- 1. INITIALIZATION ---
async function initSurahData() {
  try {
    const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
    const data = await res.json();
    allSurahs = data.chapters;

    // Default to Daily Mode on start
    setMode('daily');
  } catch (e) {
    console.error("Error loading Surahs", e);
    showToast("خطأ في الاتصال بالخادم");
  }
}

// --- MODE TOGGLING (FIXED HIGHLIGHTS) ---
function setMode(mode) {
  const toggleBg = document.getElementById('toggleBg');
  const btnDaily = document.getElementById('btn-daily');
  const btnRandom = document.getElementById('btn-random');

  if (mode === 'daily') {
    isRandomMode = false;
    // Move background to the right (Arabic RTL) or left depending on your layout
    // If your "Daily" is on the right side of the toggle:
    toggleBg.style.right = '4px';

    // Update Text Colors
    btnDaily.classList.remove('text-slate-500');
    btnDaily.classList.add('text-white');

    btnRandom.classList.remove('text-white');
    btnRandom.classList.add('text-slate-500');

    fetchVerseByKey(getDailyVerseKey());
  } else {
    isRandomMode = true;
    toggleBg.style.right = '50%';

    // Update Text Colors
    btnRandom.classList.remove('text-slate-500');
    btnRandom.classList.add('text-white');

    btnDaily.classList.remove('text-white');
    btnDaily.classList.add('text-slate-500');

    generateNewVerse();
  }
}

function getDailyVerseKey() {
  const today = new Date().toISOString().split('T')[0];
  return DAILY_VERSES[today] || "2:255"; // Default if date not found
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
  const surahId = document.getElementById('surahInput').value;
  const ayahId = document.getElementById('ayahInput').value;
  if (!surahId || !ayahId) { showToast("يرجى اختيار السورة والآية"); return; }
  fetchVerseByKey(`${surahId}:${ayahId}`);
}

// --- 3. CORE FETCH LOGIC (FIXED) ---
function fetchVerseByKey(verseKey) {
  const verseEl = document.getElementById('verse');
  verseEl.style.opacity = '0.3';
  currentAudio.pause();

  // Reset Tafsir and Audio UI on every new verse
  document.getElementById('tafsirPanel').classList.add('hidden');
  resetAudioUI();

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
      if (chapterObj) {
        document.getElementById('surahSearch').value = chapterObj.name_arabic;
        document.getElementById('surahInput').value = surahNum;
        document.getElementById('ayahInput').value = verseNum;
        document.getElementById('chapter').innerHTML = `سورة ${chapterObj.name_arabic} : آية ${verseNum}`;
      }
      loadRecitation();
    });
}

function generateNewVerse() {
  // Only fetch a random one if we are in Random Mode
  if (!isRandomMode) {
    setMode('random');
    return;
  }
  fetch('https://api.quran.com/api/v4/verses/random').then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key));
}

// --- 4. AUDIO & TAFSIR (RESTORED) ---
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
      content.innerText = data.tafsir.text.replace(/<[^>]*>?/gm, '');
    })
    .catch(() => content.innerText = "تعذر تحميل التفسير");
}

// --- 5. IMAGE GENERATION (CANVAS) ---
function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;

  canvas.width = 1080;
  canvas.height = 1080;

  ctx.fillStyle = '#1a2e2c';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 20;
  ctx.strokeRect(40, 40, 1000, 1000);

  let fontSize = 60;
  let lineHeight = fontSize * 1.5;
  let lines = [];
  const maxWidth = 850;
  const maxHeight = 750;

  while (fontSize > 20) {
    ctx.font = `${fontSize}px "Amiri Quran", serif`;
    lines = [];
    let words = verseText.split(' ');
    let currentLine = '';

    words.forEach(word => {
      let testLine = currentLine + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = word + ' ';
      } else { currentLine = testLine; }
    });
    lines.push(currentLine);

    if (lines.length * (fontSize * 1.5) <= maxHeight) break;
    fontSize -= 5;
    lineHeight = fontSize * 1.5;
  }

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  let totalTextHeight = lines.length * lineHeight;
  let y = (1080 / 2) - (totalTextHeight / 2) + (fontSize / 2);

  lines.forEach(line => {
    ctx.fillText(line, 540, y);
    y += lineHeight;
  });

  ctx.fillStyle = '#2dd4bf';
  ctx.font = '40px "Amiri", serif';
  ctx.fillText(chapterText, 540, y + 60);

  ctx.font = 'italic 25px "Rakkas"';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('تطبيق يتلو | Yatlo Quran', 540, 1020);

  document.getElementById('previewImage').src = canvas.toDataURL();
  const modal = document.getElementById('shareModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeModal() {
  const modal = document.getElementById('shareModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }, 300);
}

function goToSurah() {
  if (currentSurahNumber) {
    window.location.href = `/build/surah.html?surah=${currentSurahNumber}`;
  } else {
    showToast("يرجى اختيار سورة أولاً");
  }
}

// --- 6. NATIVE SHARING & CLIPBOARD ---
async function shareTo(platform) {
  const canvas = document.getElementById('shareCanvas');
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'yatlo-verse.png', { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'آية من يتلو',
        text: document.getElementById('verse').innerText
      });
    } catch (err) { console.log("Share canceled"); }
  }
  else {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast("تم نسخ الصورة! قم باللصق في التطبيق");
      if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(document.getElementById('chapter').innerText)}`, '_blank');
      }
    } catch (err) {
      downloadFromPreview();
      showToast("تم تحميل الصورة للمشاركة يدوياً");
    }
  }
}

// --- 7. UTILS (FIXED TOAST) ---
function showToast(message) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  msgEl.innerText = message;

  // Correctly handling Tailwind's opacity classes
  toast.classList.remove('opacity-0');
  toast.classList.add('opacity-100');

  setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0');
  }, 3000);
}

function downloadFromPreview() {
  const a = document.createElement('a'); a.download = 'yatlo_verse.png';
  a.href = document.getElementById('previewImage').src; a.click();
}

// Event Listeners
document.addEventListener('click', e => {
  if (!e.target.closest('#surahSearch')) document.getElementById('surahList').classList.add('hidden');
});
currentAudio.onended = resetAudioUI;

initSurahData();