/**
 * Yatlo Duas Engine - Final Fixed RTL Version
 */

const DuaEngine = {
    currentCategory: 'morning',
    API_URL: 'https://raw.githubusercontent.com/nawafalqari/azkar-api/56df51279ab6eb86dc2f6202c7de26c8948331c1/azkar.json',

    async init() {
        this.setTimeBasedCategory();
    },

    async fetchDuas() {
        const container = document.getElementById('duaContainer');
        const loader = document.getElementById('duaLoader');

        container.innerHTML = "";
        loader.classList.remove('hidden');

        try {
            const response = await fetch(this.API_URL);
            const data = await response.json();

            const categoryMap = {
                'morning': 'أذكار الصباح',
                'evening': 'أذكار المساء',
                'sleep': 'أذكار النوم',
                'prayer': 'أذكار بعد السلام من الصلاة المفروضة'
            };

            const targetCategory = categoryMap[this.currentCategory];

            let rawData = Array.isArray(data) ?
                data.filter(item => item.category === targetCategory) :
                (data[targetCategory] || []);

            const cleanData = rawData.filter(item => {
                const text = item.zekr || item.content || "";
                return text.length > 10;
            });

            loader.classList.add('hidden');

            if (cleanData.length > 0) {
                this.render(cleanData);
            } else {
                container.innerHTML = `<p class="text-center py-20 text-slate-500 font-['Amiri']">لا توجد بيانات حالياً لهذا القسم.</p>`;
            }

        } catch (error) {
            console.error("DuaEngine Error:", error);
            loader.classList.add('hidden');
            container.innerHTML = `<div class="text-center text-red-400 py-10">حدث خطأ في جلب الأذكار</div>`;
        }
    },

    render(duas) {
        const container = document.getElementById('duaContainer');
        container.innerHTML = duas.map((dua) => {
            const text = dua.zekr || dua.content;
            const desc = dua.description || dua.reference || 'من كتاب حصن المسلم';
            let count = parseInt(dua.count) || 1;
            if (count <= 0) count = 1;

            return `
                <div class="dua-card group">
                    <p class="dua-text">${text}</p>
                    <div class="flex justify-between items-center border-t border-teal-900/20 pt-8">
                        <button onclick="DuaEngine.handleCount(this, ${count})" class="misbaha-btn">
                            <ion-icon name="finger-print-outline" class="text-2xl opacity-70"></ion-icon>
                            <span class="text-2xl font-black count-num">${count}</span>
                            <div class="progress-bar" style="width: 0%"></div>
                        </button>
                        <div class="flex flex-col items-end max-w-[50%]">
                            <span class="text-[9px] text-teal-500 font-bold uppercase tracking-widest mb-1">المصدر</span>
                            <p class="text-xs text-slate-400 font-['Amiri'] text-right leading-relaxed italic">${desc}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    handleCount(btn, max) {
        const span = btn.querySelector('.count-num');
        const bar = btn.querySelector('.progress-bar');
        let current = parseInt(span.innerText);

        if (current > 0) {
            current--;
            span.innerText = current;
            if (bar) bar.style.width = `${((max - current) / max) * 100}%`;

            if (current === 0) {
                btn.classList.replace('bg-teal-600', 'bg-emerald-800');
                btn.innerHTML = `<ion-icon name="checkmark-done" class="text-2xl"></ion-icon>`;
                btn.closest('.dua-card').classList.add('completed');
                if (window.navigator.vibrate) window.navigator.vibrate([30, 20, 30]);
                this.checkCompletion();
            } else if (window.navigator.vibrate) {
                window.navigator.vibrate(15);
            }
        }
    },

    changeCategory(cat, btn, index) {
        // 1. Move Pill: In RTL, moving "forward" means translating negative X
        const pill = document.getElementById('activePill');
        const moveX = index * 100;
        pill.style.transform = `translateX(-${moveX}%)`;

        // 2. State
        document.querySelectorAll('.dua-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 3. Logic
        this.currentCategory = cat;
        this.fetchDuas();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    setTimeBasedCategory() {
        const hour = new Date().getHours();
        let index = 0;

        if (hour >= 5 && hour < 15) {
            this.currentCategory = 'morning';
            index = 0;
        } else if (hour >= 15 && hour < 21) {
            this.currentCategory = 'evening';
            index = 1;
        } else {
            this.currentCategory = 'sleep';
            index = 2;
        }

        const btns = document.querySelectorAll('.dua-btn');
        if (btns[index]) this.changeCategory(this.currentCategory, btns[index], index);
    },

    checkCompletion() {
        const total = document.querySelectorAll('.count-num').length;
        const finished = Array.from(document.querySelectorAll('.count-num')).filter(s => s.innerText == "0").length;

        if (total > 0 && total === finished) {
            const toast = document.getElementById('toast');
            toast.style.opacity = "1";
            setTimeout(() => toast.style.opacity = "0", 3000);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => DuaEngine.init());