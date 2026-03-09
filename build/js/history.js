let sb = window.sb || null;

async function loadHistory() {
    const listEl = document.getElementById('historyList');
    const loadingEl = document.getElementById('loading');

    try { await window.getSupabaseClient(); sb = window.sb || window.supabaseClient || sb; } catch (e) { console.warn('Supabase unavailable for history', e); }

    try {
        const { data: notes, error } = await sb
            .from('verse_notes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!notes || notes.length === 0) {
            listEl.innerHTML = `<p class="text-center text-gray-600 quran-font">لا يوجد سجل حتى الآن</p>`;
            return;
        }

        loadingEl.classList.add('hidden');

        for (const item of notes) {
            const verseData = await fetchVerseText(item.verse_key);
            const date = new Date(item.created_at).toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            const card = document.createElement('div');
            card.className = "glass p-6 rounded-2xl space-y-4 hover:border-teal-500/30 transition-all duration-500";

            // USING YOUR EXISTING GLOBAL FILTER
            const filteredVerse = applyHamzaFilter(verseData);
            const filteredNote = applyHamzaFilter(item.note_text);

            card.innerHTML = `
                <div class="flex justify-between items-start border-b border-white/5 pb-4">
                    <span class="text-teal-500 font-bold text-xs">آية ${item.verse_key}</span>
                    <span class="text-gray-500 text-[10px] font-light">${date}</span>
                </div>
                <p class="quran-font text-xl leading-relaxed text-right text-white/90">${filteredVerse}</p>
                ${item.note_text ? `
                    <div class="bg-teal-500/5 p-4 rounded-xl border-r-2 border-teal-500">
                        <p class="text-gray-300 text-sm leading-relaxed quran-font">${filteredNote}</p>
                    </div>
                ` : ''}
            `;
            listEl.appendChild(card);
        }
    } catch (e) {
        listEl.innerHTML = `<p class="text-center text-red-400">حدث خطأ</p>`;
    }
}

async function fetchVerseText(key) {
    try {
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani`);
        const data = await res.json();
        return data.verse.text_uthmani;
    } catch { return "خطأ في تحميل الآية"; }
}

loadHistory();