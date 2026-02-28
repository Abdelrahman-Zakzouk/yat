/**
 * يتلو | Yatlo Profile Logic 
 */

const ProfileManager = {
    user: null,

    async init() {
        // SAFETY CHECK: Ensure the Supabase engine is loaded from hadiths.js
        if (typeof HadithEngine === 'undefined' || !HadithEngine.sb) {
            console.error("HadithEngine not found. Ensure hadiths.js is loaded before profile.js");
            return;
        }

        try {
            // 1. Get current user session
            const { data: { user }, error: authError } = await HadithEngine.sb.auth.getUser();

            if (authError || !user) {
                window.location.href = '/build/html/auth.html?auth=required';
                return;
            }

            this.user = user;

            // 2. Fetch Profile Data (Using maybeSingle to prevent crash on new users)
            const { data: profile, error: profileError } = await HadithEngine.sb
                .from('profiles')
                .select('avatar_url, is_admin')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError) console.error("Profile Fetch Error:", profileError);

            // Handle Admin Button Visibility
            const adminBtn = document.getElementById('adminDashboardBtn');
            if (profile?.is_admin && adminBtn) {
                adminBtn.classList.remove('hidden');
            }

            // Priority: 1. DB Table, 2. Google Metadata, 3. Null
            const finalPfpUrl = profile?.avatar_url || user.user_metadata?.avatar_url;
            this.renderUserHeader(finalPfpUrl);

            // 3. Load user specific content
            this.loadFavorites();

        } catch (err) {
            console.error("Initialization Failed:", err);
            showToast("⚠️ حدث خطأ أثناء تحميل البيانات");
        }
    },

    renderUserHeader(pfpUrl) {
        const emailEl = document.getElementById('profileEmail');
        const idEl = document.getElementById('profileId');
        const pfpImg = document.getElementById('userPfp');
        const defIcon = document.getElementById('defaultIcon');

        if (emailEl) emailEl.innerText = this.user.email;
        if (idEl) idEl.innerText = `ID: ${this.user.id}`;

        if (pfpUrl && pfpImg) {
            pfpImg.src = pfpUrl.includes('?') ? pfpUrl : `${pfpUrl}?t=${new Date().getTime()}`;
            pfpImg.classList.remove('hidden');
            if (defIcon) defIcon.classList.add('hidden');
        } else if (defIcon) {
            if (pfpImg) pfpImg.classList.add('hidden');
            defIcon.classList.remove('hidden');
        }
    },

    async copyId() {
        if (!this.user) return;
        try {
            await navigator.clipboard.writeText(this.user.id);
            showToast("✅ تم نسخ المعرف (ID)");
        } catch (err) {
            showToast("❌ فشل النسخ");
        }
    },

    async uploadPfp(event) {
        const file = event.target.files[0];
        if (!file || !this.user) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast("⚠️ حجم الصورة كبير جداً (الأقصى 2MB)");
            return;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${this.user.id}/avatar.${fileExt}`;

        try {
            showToast("⏳ جاري رفع الصورة...");

            const { error: uploadError } = await HadithEngine.sb.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = HadithEngine.sb.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const { error: dbError } = await HadithEngine.sb
                .from('profiles')
                .upsert({
                    id: this.user.id,
                    avatar_url: publicUrl,
                    updated_at: new Date()
                });

            if (dbError) throw dbError;

            this.renderUserHeader(publicUrl);
            showToast("✅ تم تحديث الصورة الشخصية");

        } catch (err) {
            console.error("Upload Error:", err);
            showToast("❌ فشل في حفظ الصورة");
        }
    },

    async loadFavorites() {
        const container = document.getElementById('favoritesList');
        const countEl = document.getElementById('favCount');
        const statusEl = document.getElementById('listStatus');

        if (!container) return;

        try {
            const { data: favs, error } = await HadithEngine.sb
                .from('hadith_notes')
                .select('*')
                .eq('user_id', this.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!favs || favs.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-20 opacity-40">
                        <i class="fas fa-heart-broken text-4xl mb-4"></i>
                        <p>لا توجد أحاديث محفوظة حالياً</p>
                    </div>`;
                if (countEl) countEl.innerText = "0";
                if (statusEl) statusEl.innerText = "قائمة فارغة";
                return;
            }

            if (countEl) countEl.innerText = favs.length;
            if (statusEl) statusEl.innerText = `${favs.length} حديث`;

            container.innerHTML = favs.map(item => `
                <div id="fav-${item.id}" class="glass-card rounded-[2rem] p-6 transition-all hover:border-teal-500/30 group mb-4">
                    <p class="quran-font text-xl text-right text-white/90 mb-4 leading-loose">
                        ${item.hadith_text || 'نص الحديث غير متوفر'}
                    </p>
                    <div class="flex justify-between items-center border-t border-white/5 pt-4">
                        <button onclick="ProfileManager.removeFavorite(${item.id})" 
                                class="text-xs text-red-400/50 hover:text-red-400 transition-colors flex items-center gap-2">
                            <i class="fas fa-trash-alt"></i> حذف
                        </button>
                        <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            ${(HadithEngine.BOOKS && HadithEngine.BOOKS[item.book_key]) || item.book_key} | رقم ${item.hadith_number}
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (e) {
            console.error("Load Favorites Error:", e);
            showToast("⚠️ فشل تحميل المفضلة");
        }
    },

    async removeFavorite(id) {
        const { error } = await HadithEngine.sb
            .from('hadith_notes')
            .delete()
            .eq('id', id);

        if (!error) {
            const element = document.getElementById(`fav-${id}`);
            if (element) {
                element.style.transform = "scale(0.95)";
                element.style.opacity = "0";
                setTimeout(() => this.loadFavorites(), 300);
            }
            showToast("✅ تم الحذف من المفضلة");
        } else {
            showToast("❌ فشل الحذف");
        }
    }
};

// Global Handlers
window.handleLogout = async () => {
    const { error } = await HadithEngine.sb.auth.signOut();
    if (!error) window.location.href = '/index.html';
};

function showToast(m) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!t || !msgEl) return;
    msgEl.innerText = m;
    t.classList.replace('opacity-0', 'opacity-100');
    t.style.pointerEvents = 'auto';
    setTimeout(() => {
        t.classList.replace('opacity-100', 'opacity-0');
        t.style.pointerEvents = 'none';
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => ProfileManager.init());