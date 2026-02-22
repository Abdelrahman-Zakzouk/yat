const params = new URLSearchParams(window.location.search);
const surahNumber = params.get("surah");

if (!surahNumber) {
    window.location.href = '/index.html';
} else {
    loadSurah(surahNumber);
}

function loadSurah(number) {
    // 1. Fetch Verses
    fetch(`https://api.quran.com/api/v4/verses/by_chapter/${number}?language=ar&fields=text_uthmani&per_page=300`)
        .then(res => res.json())
        .then(data => {
            // APPLY HAMZA FILTER TO VERSES
            const filteredData = applyHamzaFilter(data);

            let html = filteredData.verses.map(v => `
                <div class="verse-row">
                    <div class="verse-meta">${v.verse_number}</div>
                    <div class="verse-text-content">${v.text_uthmani}</div>
                </div>
            `).join("");
            document.getElementById("surahContent").innerHTML = html;
        });

    // 2. Fetch Surah Metadata
    fetch(`https://api.quran.com/api/v4/chapters/${number}?language=ar`)
        .then(res => res.json())
        .then(data => {
            // APPLY HAMZA FILTER TO CHAPTER INFO
            const filteredChapter = applyHamzaFilter(data.chapter);

            const ch = filteredChapter;
            document.getElementById("surahTitle").innerText = "سورة " + ch.name_arabic;
            document.getElementById("surahDetails").innerHTML = `
                <p>عدد الآيات: ${ch.verses_count}</p>
                <p>مكان النزول: ${ch.revelation_place === 'makkah' ? 'مكية' : 'مدنية'}</p>
                <p>الترتيب: ${ch.id}</p>
            `;
            document.title = "سورة " + ch.name_arabic;
        });
}

function goBack() {
    window.location.href = '/index.html';
}