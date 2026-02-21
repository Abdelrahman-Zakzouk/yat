let currentSurahNumber = null;
let currentVerseKey = null;
let currentAudio = new Audio();
let allSurahs = [];

// --- 1. INITIALIZATION ---
async function initSurahData() {
  try {
    const res = await fetch('https://api.quran.com/api/v4/chapters?language=ar');
    const data = await res.json();
    allSurahs = data.chapters;
    // Load a random verse on start
    generateNewVerse();
  } catch (e) {
    console.error("Error loading Surahs", e);
    showToast("خطأ في الاتصال بالخادم");
  }
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
  fetch('https://api.quran.com/api/v4/verses/random').then(res => res.json())
    .then(data => fetchVerseByKey(data.verse.verse_key));
}

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
  document.getElementById('tafsirContent').innerText = "جاري التحميل...";
  panel.classList.remove('hidden');
  fetch(`https://api.quran.com/api/v4/tafsirs/16/by_ayah/${currentVerseKey}`)
    .then(res => res.json()).then(data => {
      document.getElementById('tafsirContent').innerText = data.tafsir.text.replace(/<[^>]*>?/gm, '');
    });
}

// --- 5. IMAGE GENERATION (CANVAS) ---
function shareAsImage() {
  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');
  const verseText = document.getElementById('verse').innerText;
  const chapterText = document.getElementById('chapter').innerText;

  canvas.width = 1080;
  canvas.height = 1080;

  // 1. Draw Background
  ctx.fillStyle = '#1a2e2c';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 20;
  ctx.strokeRect(40, 40, 1000, 1000);

  // 2. Dynamic Font Scaling Logic
  let fontSize = 60; // Starting font size
  let lineHeight = fontSize * 1.5;
  let lines = [];
  const maxWidth = 850;
  const maxHeight = 750; // Maximum vertical space for the verse

  // Loop to shrink font size if text is too long
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
      } else {
        currentLine = testLine;
      }
    });
    lines.push(currentLine);

    // Check if the total height fits in the box
    if (lines.length * (fontSize * 1.5) <= maxHeight) {
      break;
    }
    fontSize -= 5;
    lineHeight = fontSize * 1.5;
  }

  // 3. Draw the Verses (Centered Vertically)
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  let totalTextHeight = lines.length * lineHeight;
  let y = (1080 / 2) - (totalTextHeight / 2) + (fontSize / 2);

  lines.forEach(line => {
    ctx.fillText(line, 540, y);
    y += lineHeight;
  });

  // 4. Draw Chapter Name below the text
  ctx.fillStyle = '#2dd4bf';
  ctx.font = '40px "Amiri", serif';
  ctx.fillText(chapterText, 540, y + 40);

  // 5. Branding at bottom
  ctx.font = 'italic 25px "Rakkas"';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('تطبيق يتلو | Yatlo Quran', 540, 1020);

  document.getElementById('previewImage').src = canvas.toDataURL();
  document.getElementById('shareModal').classList.remove('hidden');
}

// --- 6. NATIVE SHARING & CLIPBOARD ---
async function shareTo(platform) {
  const canvas = document.getElementById('shareCanvas');
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'yatlo-verse.png', { type: 'image/png' });

  // Priority 1: Native Share (Works like "injection" on Mobile)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'آية من يتلو',
        text: document.getElementById('verse').innerText
      });
    } catch (err) { console.log("Share canceled"); }
  }
  // Priority 2: Clipboard + Open WhatsApp (Desktop Fallback)
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

async function copyImageOnly() {
  const canvas = document.getElementById('shareCanvas');
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast("✅ تم نسخ الصورة! يمكنك لصقها الآن");
  } catch (err) { showToast("المتصفح لا يدعم النسخ"); }
}

// --- 7. UTILS ---
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').innerText = message;
  toast.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

function closeModal() { document.getElementById('shareModal').classList.add('hidden'); }
function downloadFromPreview() {
  const a = document.createElement('a'); a.download = 'yatlo_verse.png';
  a.href = document.getElementById('previewImage').src; a.click();
}

// Event Listeners
document.addEventListener('click', e => {
  if (!e.target.closest('#surahSearch')) document.getElementById('surahList').classList.add('hidden');
});
currentAudio.onended = resetAudioUI;

// Start the app
initSurahData();