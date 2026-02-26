/**
 * يتلو | Yatlo Hadiths - Unified Logic
 * Ported exactly from index.html sharing & copy mechanisms
 */

const HadithEngine = {
    BASE_URL: "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/",
    BOOKS: {
        "ara-bukhari": { name: "صحيح البخاري" },
        "ara-muslim": { name: "صحيح مسلم" },
        "ara-nasai": { name: "سنن النسائي" }
    },
    currentData: null
};

// --- 1. DATA FETCHING ---
async function fetchRandomHadith() {
    const textEl = document.getElementById('hadithText');
    const bookSelect = document.getElementById('bookSelect');
    if (textEl) textEl.style.opacity = "0.3";

    try {
        const response = await fetch(`${HadithEngine.BASE_URL}${bookSelect.value}.json`);
        const data = await response.json();
        const randomEntry = data.hadiths[Math.floor(Math.random() * data.hadiths.length)];

        HadithEngine.currentData = {
            text: randomEntry.text || randomEntry.hadith,
            number: randomEntry.hadithnumber,
            bookName: HadithEngine.BOOKS[bookSelect.value].name
        };

        document.getElementById('hadithText').innerText = HadithEngine.currentData.text;
        document.getElementById('hadithMeta').innerText = `${HadithEngine.currentData.bookName} : رقم ${HadithEngine.currentData.number}`;
        document.getElementById('hadithText').style.opacity = "1";
    } catch (e) {
        showToast("خطأ في تحميل الحديث");
    }
}

// --- 2. MODAL & CANVAS (Matching index.html logic) ---

async function shareAsImage() {
    const canvas = document.getElementById('shareCanvas');
    const ctx = canvas.getContext('2d');
    const data = HadithEngine.currentData;
    const modal = document.getElementById('shareModal');
    const preview = document.getElementById('previewImage');

    if (!data) return;

    // 1. Setup Canvas (Exact same 1080x1080 scale as index)
    canvas.width = 1080;
    canvas.height = 1080;

    // Background Gradient
    const gradient = ctx.createRadialGradient(540, 540, 50, 540, 540, 750);
    gradient.addColorStop(0, '#152422');
    gradient.addColorStop(1, '#0b1211');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1080);

    // Border
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(30, 30, 1020, 1020, 10);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';

    // Header (Book & Number)
    ctx.fillStyle = '#2dd4bf';
    ctx.font = '42px "Amiri", serif';
    ctx.fillText(`${data.bookName} | رقم ${data.number}`, 540, 120);

    // Dynamic Text Sizing & Wrapping
    ctx.fillStyle = 'white';
    let fontSize = 68;
    let lines = [];
    const maxWidth = 880;
    const maxHeight = 700;

    while (fontSize > 18) {
        ctx.font = `bold ${fontSize}px "Amiri", serif`;
        let currentLineHeight = fontSize * 1.5;
        lines = [];
        let words = data.text.split(' ');
        let currentLine = '';

        words.forEach(word => {
            let testLine = currentLine + word + ' ';
            if (ctx.measureText(testLine).width > maxWidth) {
                lines.push(currentLine.trim());
                currentLine = word + ' ';
            } else { currentLine = testLine; }
        });
        lines.push(currentLine.trim());
        if (lines.length * currentLineHeight <= maxHeight) break;
        fontSize -= 2;
    }

    const finalLineHeight = fontSize * 1.5;
    let y = 180 + (maxHeight - (lines.length * finalLineHeight)) / 2 + (finalLineHeight / 1.2);
    ctx.font = `bold ${fontSize}px "Amiri", serif`;
    lines.forEach(line => { ctx.fillText(line, 540, y); y += finalLineHeight; });

    // Branding
    ctx.fillStyle = '#2dd4bf';
    ctx.font = '30px "Rakkas", serif';
    ctx.fillText('تطبيق يتلو | Yatlo Hadith', 540, 1030);

    // Update Image Preview
    preview.src = canvas.toDataURL('image/png');

    // Show Modal
    modal.classList.replace('hidden', 'flex');
}

function closeModal() {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    modal.classList.replace('flex', 'hidden');
}

// --- 3. THE "WORKING" SHARING FUNCTIONS ---

async function copyImageToClipboard() {
    const canvas = document.getElementById('shareCanvas');
    try {
        canvas.toBlob(async (blob) => {
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            showToast("✅ تم نسخ الصورة بنجاح");
        });
    } catch (err) {
        showToast("📱 اضغط مطولاً على الصورة لحفظها");
    }
}

async function shareTo(platform) {
    const canvas = document.getElementById('shareCanvas');
    try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], 'hadith-yatlo.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'حديث شريف',
                text: 'من تطبيق يتلو'
            });
        } else {
            // Fallback: Link Download for older mobile browsers
            const link = document.createElement('a');
            link.download = 'hadith.png';
            link.href = canvas.toDataURL();
            link.click();
            showToast("💾 تم تحميل الصورة للمشاركة");
        }
    } catch (e) {
        showToast("فشلت المشاركة");
    }
}

/**
 * Text-only share (Used for "Copy Text" button)
 */
function shareHadithText() {
    const data = HadithEngine.currentData;
    const text = `﴿ حديث شريف ﴾\n\n${data.text}\n\nالمصدر: ${data.bookName}\nعبر تطبيق يتلو`;

    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast("✅ تم نسخ النص");
}

// --- 4. UTILS ---

function showToast(message) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.replace('opacity-0', 'opacity-100');
    setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

// Initial Run
window.getNewHadith = fetchRandomHadith;
document.addEventListener('DOMContentLoaded', fetchRandomHadith);