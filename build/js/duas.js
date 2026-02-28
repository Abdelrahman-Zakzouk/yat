/**
 * Bayani Duas Engine - Final Fixed RTL Version
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

        if (!container || !loader) return;

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
                container.innerHTML = `<p class="text-center py-20 text-slate-500 font-['Amiri']">لا توجد بيانيات حالياً لهذا القسم.</p>`;
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

        // Error Fix: If span is null, the button is already "Finished"
        if (!span) return;

        let current = parseInt(span.innerText);

        if (current > 0) {
            current--;
            span.innerText = current;

            // Update Progress Bar
            if (bar) bar.style.width = `${((max - current) / max) * 100}%`;

            // Haptic Feedback (Vibration)
            if (window.navigator.vibrate) {
                if (current === 0) {
                    window.navigator.vibrate([30, 20, 30]); // Distinct double pulse for finish
                } else {
                    window.navigator.vibrate(15); // Short tap for each click
                }
            }

            // Finished State for this specific Dua
            if (current === 0) {
                btn.classList.add('completed-state'); // Add a CSS class for styling
                btn.innerHTML = `<ion-icon name="checkmark-done" class="text-2xl text-emerald-400 animate-bounce-short"></ion-icon>`;
                btn.closest('.dua-card').style.opacity = "0.6";
                this.checkCompletion();
            }
        }
    },

    changeCategory(cat, btn, index) {
        const pill = document.getElementById('activePill');
        if (pill) {
            const moveX = index * 100;
            pill.style.transform = `translateX(-${moveX}%)`;
        }

        document.querySelectorAll('.dua-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

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
        const total = document.querySelectorAll('.dua-card').length;
        // Check how many buttons no longer have the count span (meaning they are finished)
        const finished = document.querySelectorAll('.dua-card ion-icon[name="checkmark-done"]').length;

        if (total > 0 && total === finished) {
            this.showToast("✨ تقبل الله منك.. تم الانتهاء من جميع الأذكار");
        }
    },

    showToast(msg) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        if (!toast) return;

        if (toastMsg) toastMsg.innerText = msg;
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
        }, 3500);
    }
};

document.addEventListener('DOMContentLoaded', () => DuaEngine.init());