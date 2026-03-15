let sb = window.sb || null;
let allEntries = [];
let currentFilter = 'verse';
const verseTextCache = new Map();
const hadithTextCache = new Map();

function updateSummaryStats() {
    const verseCount = allEntries.filter((item) => item._type === 'verse').length;
    const hadithCount = allEntries.filter((item) => item._type === 'hadith').length;

    const verseEl = document.getElementById('verseCount');
    const hadithEl = document.getElementById('hadithCount');
    const updatedEl = document.getElementById('historyLastUpdated');

    if (verseEl) verseEl.textContent = String(verseCount);
    if (hadithEl) hadithEl.textContent = String(hadithCount);
    if (updatedEl) {
        updatedEl.textContent = new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function setActiveFilterButton(filter) {
    document.querySelectorAll('.history-filter-btn').forEach((btn) => {
        const isActive = btn.dataset.historyFilter === filter;
        if (isActive) {
            btn.classList.add('bg-teal-500/20', 'text-teal-300', 'border-teal-400/30');
            btn.classList.remove('text-slate-300', 'border-transparent');
        } else {
            btn.classList.remove('bg-teal-500/20', 'text-teal-300', 'border-teal-400/30');
            btn.classList.add('text-slate-300', 'border-transparent');
        }
    });
}

function getFilteredEntries() {
    if (currentFilter === 'hadith') return allEntries.filter((item) => item._type === 'hadith');
    return allEntries.filter((item) => item._type === 'verse');
}

function bindHistoryFilters() {
    const buttons = document.querySelectorAll('.history-filter-btn');
    if (!buttons.length) return;

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const selected = btn.dataset.historyFilter || 'all';
            if (selected === currentFilter) return;
            currentFilter = selected;
            setActiveFilterButton(currentFilter);
            await renderHistoryEntries();
        });
    });

    setActiveFilterButton(currentFilter);
}

function bindRefreshButton() {
    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'جاري التحديث...';
        await loadHistory({ forceRefresh: true });
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'تحديث';
    });
}

async function renderHistoryEntries() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    const entries = getFilteredEntries();
    if (!entries.length) {
        const emptyText = currentFilter === 'hadith'
            ? 'لا توجد أحاديث محفوظة حتى الآن'
            : 'لا توجد آيات محفوظة حتى الآن';
        listEl.innerHTML = `
            <div class="glass rounded-2xl p-8 text-center">
                <ion-icon name="folder-open-outline" class="text-3xl text-slate-500 mb-2"></ion-icon>
                <p class="text-gray-500 quran-font text-xl">${emptyText}</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = '';

    for (const item of entries) {
        const date = new Date(item.created_at).toLocaleDateString('ar-EG', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const card = document.createElement('div');
        card.className = `history-entry glass p-6 rounded-2xl space-y-4 hover:border-teal-500/30 transition-all duration-500 ${item._type === 'verse' ? 'history-entry-verse' : 'history-entry-hadith'}`;

        if (item._type === 'verse') {
            const verseData = await fetchVerseText(item.verse_key);
            const filteredVerse = applyHamzaFilter(verseData);
            const filteredNote = applyHamzaFilter(item.note_text || '');

            card.innerHTML = `
                <div class="flex justify-between items-start border-b border-white/5 pb-4">
                    <span class="text-teal-400 font-bold text-xs">آية ${item.verse_key}</span>
                    <span class="text-gray-500 text-[10px] font-light">${date}</span>
                </div>
                <p class="quran-font text-xl leading-relaxed text-right text-white/90">${filteredVerse}</p>
                ${item.note_text ? `
                    <div class="bg-teal-500/5 p-4 rounded-xl border-r-2 border-teal-500">
                        <span class="inline-flex mb-2 px-2 py-1 text-[10px] rounded-full bg-teal-500/15 text-teal-300">ملاحظة</span>
                        <p class="text-gray-300 text-sm leading-relaxed quran-font">${filteredNote}</p>
                    </div>
                ` : ''}
            `;
        } else {
            const hadithText = await fetchHadithText(item.book_key, item.hadith_number);
            const filteredHadith = applyHamzaFilter(hadithText);
            const filteredNote = applyHamzaFilter(item.note_text || '');
            const bookName = item.book_key === 'ara-muslim' ? 'صحيح مسلم' : 'صحيح البخاري';

            card.innerHTML = `
                <div class="flex justify-between items-start border-b border-white/5 pb-4">
                    <span class="text-amber-400 font-bold text-xs">حديث ${bookName} • ${item.hadith_number}</span>
                    <span class="text-gray-500 text-[10px] font-light">${date}</span>
                </div>
                <p class="quran-font text-xl leading-relaxed text-right text-white/90">${filteredHadith}</p>
                ${item.note_text ? `
                    <div class="bg-amber-500/5 p-4 rounded-xl border-r-2 border-amber-500">
                        <span class="inline-flex mb-2 px-2 py-1 text-[10px] rounded-full bg-amber-500/15 text-amber-300">ملاحظة</span>
                        <p class="text-gray-300 text-sm leading-relaxed quran-font">${filteredNote}</p>
                    </div>
                ` : ''}
            `;
        }

        listEl.appendChild(card);
    }
}

async function loadHistory(options = {}) {
    const { forceRefresh = false } = options;
    const listEl = document.getElementById('historyList');
    const loadingEl = document.getElementById('loading');

    bindHistoryFilters();
    bindRefreshButton();

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (listEl && forceRefresh) listEl.innerHTML = '';

    if (forceRefresh) {
        verseTextCache.clear();
        hadithTextCache.clear();
    }

    try { await window.getSupabaseClient(); sb = window.sb || window.supabaseClient || sb; } catch (e) { console.warn('Supabase unavailable for history', e); }

    if (!sb) {
        if (loadingEl) loadingEl.classList.add('hidden');
        listEl.innerHTML = `<p class="text-center text-red-400">تعذر الاتصال بقاعدة البيانيات</p>`;
        return;
    }

    try {
        const [{ data: verseNotes, error: verseErr }, { data: hadithNotes, error: hadithErr }] = await Promise.all([
            sb
            .from('verse_notes')
            .select('*')
                .order('created_at', { ascending: false }),
            sb
                .from('hadith_notes')
                .select('*')
                .order('created_at', { ascending: false })
        ]);

        if (verseErr) throw verseErr;
        if (hadithErr) throw hadithErr;

        allEntries = [
            ...(verseNotes || []).map(v => ({ ...v, _type: 'verse' })),
            ...(hadithNotes || []).map(h => ({ ...h, _type: 'hadith' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        updateSummaryStats();

        if (!allEntries.length) {
            if (loadingEl) loadingEl.classList.add('hidden');
            listEl.innerHTML = `
                <div class="glass rounded-2xl p-8 text-center">
                    <ion-icon name="file-tray-outline" class="text-3xl text-slate-500 mb-2"></ion-icon>
                    <p class="text-gray-500 quran-font text-xl">لا يوجد سجل حتى الآن</p>
                </div>
            `;
            return;
        }

        if (loadingEl) loadingEl.classList.add('hidden');

        await renderHistoryEntries();
    } catch (e) {
        if (loadingEl) loadingEl.classList.add('hidden');
        listEl.innerHTML = `
            <div class="glass rounded-2xl p-8 text-center border border-red-500/20">
                <ion-icon name="alert-circle-outline" class="text-3xl text-red-400 mb-2"></ion-icon>
                <p class="text-red-400">حدث خطأ أثناء جلب السجل</p>
            </div>
        `;
    }
}

async function fetchVerseText(key) {
    if (verseTextCache.has(key)) return verseTextCache.get(key);

    try {
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani`);
        const data = await res.json();
        const result = data.verse.text_uthmani;
        verseTextCache.set(key, result);
        return result;
    } catch {
        return "خطأ في تحميل الآية";
    }
}

async function fetchHadithText(bookKey, hadithNumber) {
    const cacheKey = `${bookKey || 'ara-bukhari'}:${hadithNumber}`;
    if (hadithTextCache.has(cacheKey)) return hadithTextCache.get(cacheKey);

    try {
        const finalBook = bookKey || 'ara-bukhari';
        const isMuslim = finalBook === 'ara-muslim';
        const res = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${finalBook}${isMuslim ? '.min' : ''}.json`);
        const data = await res.json();
        const entry = data?.hadiths?.find(h => String(h.hadithnumber) === String(hadithNumber));
        const result = entry?.text || entry?.hadith || 'خطأ في تحميل الحديث';
        hadithTextCache.set(cacheKey, result);
        return result;
    } catch {
        return 'خطأ في تحميل الحديث';
    }
}

loadHistory();