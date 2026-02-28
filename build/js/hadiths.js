/**
 * Yatlo | يتلو - Unified Hadith Engine
 */
const HadithApp = {
    API: "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/",
    BOOKS: {
        "ara-bukhari": "صحيح البخاري",
        "ara-muslim": "صحيح مسلم",
        "ara-nasai": "سنن النسائي",
        "ara-abudawud": "سنن أبي داود"
    },
    current: null,
    mode: 'daily'
};

async function fetchHadith() {
    const textEl = document.getElementById('hadithText');
    const metaEl = document.getElementById('hadithMeta');
    const bookId = document.getElementById('bookSelect').value;

    textEl.classList.remove('opacity-100', 'translate-y-0');
    textEl.classList.add('opacity-0', 'translate-y-4');

    try {
        const res = await fetch(`${HadithApp.API}${bookId}.json`);
        const data = await res.json();

        let index;
        if (HadithApp.mode === 'daily') {
            const seed = new Date().toDateString();
            index = Math.abs(seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % data.hadiths.length;
        } else {
            index = Math.floor(Math.random() * data.hadiths.length);
        }

        const entry = data.hadiths[index];
        HadithApp.current = {
            text: entry.text || entry.hadith,
            number: entry.hadithnumber,
            book: HadithApp.BOOKS[bookId]
        };

        setTimeout(() => {
            textEl.innerText = HadithApp.current.text;
            metaEl.innerText = `${HadithApp.current.book} • رقم ${HadithApp.current.number}`;
            textEl.classList.remove('opacity-0', 'translate-y-4');
            textEl.classList.add('opacity-100', 'translate-y-0');
        }, 400);

    } catch (err) {
        showToast("❌ فشل تحميل البيانات");
    }
}

function setAppMode(mode) {
    HadithApp.mode = mode;
    const bg = document.getElementById('toggleBg');
    const btnD = document.getElementById('mode-daily');
    const btnR = document.getElementById('mode-random');
    bg.style.transform = (mode === 'daily') ? 'translateX(0)' : 'translateX(-100%)';
    fetchHadith();
}

// Fixed function name to match your HTML "onclick"
async function shareAsImage() {
    if (!HadithApp.current) return;
    const canvas = document.getElementById('shareCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1080;
    canvas.height = 1080;

    const grad = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
    grad.addColorStop(0, '#152422'); grad.addColorStop(1, '#0b1211');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 10; ctx.strokeRect(40, 40, 1000, 1000);

    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillStyle = '#2dd4bf';
    ctx.font = '40px "Amiri", serif';
    ctx.fillText(`${HadithApp.current.book} | رقم ${HadithApp.current.number}`, 540, 120);

    ctx.fillStyle = 'white';
    let fontSize = 60;
    let words = HadithApp.current.text.split(' ');
    let lines = [];

    const wrap = (size) => {
        ctx.font = `bold ${size}px "Amiri", serif`;
        let currentLines = [], line = '';
        words.forEach(w => {
            let test = line + w + ' ';
            if (ctx.measureText(test).width > 850) { currentLines.push(line); line = w + ' '; }
            else { line = test; }
        });
        currentLines.push(line);
        return currentLines;
    };

    lines = wrap(fontSize);
    while (lines.length * fontSize * 1.5 > 700) { fontSize -= 5; lines = wrap(fontSize); }
    let y = 540 - (lines.length * fontSize * 0.7);
    lines.forEach(l => { ctx.fillText(l.trim(), 540, y); y += fontSize * 1.5; });

    ctx.fillStyle = '#2dd4bf';
    ctx.font = '30px "Rakkas", serif';
    ctx.fillText('تطبيق يتلو | Yatlo Hadith', 540, 1030);

    document.getElementById('previewImage').src = canvas.toDataURL();
    toggleModal('shareModal', true);
}

// Fixed function name to match your HTML "onclick"
function copyToClipboard() {
    if (!HadithApp.current) return;
    const msg = `﴿ حديث شريف ﴾\n\n${HadithApp.current.text}\n\nالمصدر: ${HadithApp.current.book}\nعبر تطبيق يتلو`;
    navigator.clipboard.writeText(msg).then(() => showToast("✅ تم نسخ نص الحديث"));
}

async function copyImageToClipboard() {
    const canvas = document.getElementById('shareCanvas');
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        showToast("✅ تم نسخ الصورة للحافظة");
    } catch (err) {
        showToast("📱 اضغط مطولاً على الصورة لنسخها");
    }
}

async function triggerNativeShare() {
    const canvas = document.getElementById('shareCanvas');
    try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], 'hadith-yatlo.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'حديث شريف', text: 'عبر تطبيق يتلو' });
        } else {
            copyImageToClipboard();
        }
    } catch (e) { console.error(e); }
}

function toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;

    // Get the inner content box (the div inside the overlay)
    const content = el.querySelector('div');

    if (show) {
        // OPEN LOGIC
        el.classList.remove('hidden');
        el.classList.add('flex');
        document.body.style.overflow = 'hidden';
    } else {
        // CLOSE LOGIC (Wait for animation)
        if (content) content.classList.add('modal-closing');
        el.classList.add('overlay-closing');

        // Wait 300ms (duration of our CSS animation)
        setTimeout(() => {
            el.classList.remove('flex');
            el.classList.add('hidden');

            // Reset classes for the next time it opens
            if (content) content.classList.remove('modal-closing');
            el.classList.remove('overlay-closing');

            document.body.style.overflow = 'auto';
        }, 300);
    }
}

function showToast(m) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    if (msgEl) msgEl.innerText = m;
    t.classList.replace('opacity-0', 'opacity-100');
    setTimeout(() => t.classList.replace('opacity-100', 'opacity-0'), 3000);
}

document.addEventListener('DOMContentLoaded', fetchHadith);