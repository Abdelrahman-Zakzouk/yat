/**
 * يتلو | Yatlo Authentication Logic
 * Supports: Email/Password, Google OAuth, and Password Reset
 */

const AuthUI = {
    isLogin: true,
    sb: null,

    // UI Elements
    form: null,
    submitBtn: null,
    toggleBtn: null,
    subtitle: null,
    toggleText: null,

    init() {
        console.log("AuthUI: Searching for Supabase client...");

        // Find the Supabase client - checking HadithEngine specifically
        this.sb = window.supabaseClient || window.sb || (window.HadithEngine ? window.HadithEngine.sb : null);

        // If not found yet, wait 500ms and try again
        if (!this.sb) {
            console.warn("AuthUI: Supabase not ready. Retrying in 500ms...");
            setTimeout(() => this.init(), 500);
            return;
        }

        // Initialize UI Elements now that we know we're ready
        this.form = document.getElementById('authForm');
        this.submitBtn = document.getElementById('submitBtn');
        this.toggleBtn = document.getElementById('toggleBtn');
        this.subtitle = document.getElementById('authSubtitle');
        this.toggleText = document.getElementById('toggleText');

        // Standard Event Listeners
        this.toggleBtn?.addEventListener('click', () => this.toggleMode());
        this.form?.addEventListener('submit', (e) => this.handleSubmit(e));

        // Attach to window so onclick="AuthUI.signInWithProvider()" works in HTML
        window.AuthUI = this;

        console.log("AuthUI: Initialized successfully and connected to Supabase.");
    },

    toggleMode() {
        this.isLogin = !this.isLogin;

        if (this.submitBtn) this.submitBtn.querySelector('span').innerText = this.isLogin ? "تسجيل الدخول" : "إنشاء حساب";
        if (this.subtitle) this.subtitle.innerText = this.isLogin ? "قم بتسجيل الدخول لمتابعة حفظ أحاديثك" : "انضم إلينا وابدأ بحفظ أحاديثك الخاصة";
        if (this.toggleText) this.toggleText.innerText = this.isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟";
        if (this.toggleBtn) this.toggleBtn.innerText = this.isLogin ? "إنشاء حساب جديد" : "تسجيل الدخول";

        this.form?.classList.add('opacity-50');
        setTimeout(() => this.form?.classList.remove('opacity-50'), 200);
    },

    async handleSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast("⚠️ يرجى ملء جميع الحقول");
            return;
        }

        this.setLoading(true);

        try {
            if (this.isLogin) {
                const { error } = await this.sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                window.location.href = 'profile.html';
            } else {
                const { error } = await this.sb.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin + '/build/html/profile.html'
                    }
                });
                if (error) throw error;
                showToast("✅ تم إنشاء الحساب! تفقد بريدك الإلكتروني لتأكيد التسجيل");
            }
        } catch (err) {
            showToast("⚠️ " + this.translateError(err.message));
        } finally {
            this.setLoading(false);
        }
    },

    async signInWithProvider(provider) {
        if (!this.sb) {
            showToast("⚠️ جاري تهيئة النظام...");
            return;
        }

        console.log(`Starting OAuth flow for: ${provider}`);
        try {
            const redirectUrl = window.location.origin + '/build/html/profile.html';

            const { error } = await this.sb.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: redirectUrl,
                    queryParams: { prompt: 'select_account' }
                }
            });

            if (error) throw error;
        } catch (err) {
            console.error("OAuth Error:", err);
            showToast("⚠️ " + this.translateError(err.message));
        }
    },

    async handleForgotPassword() {
        const email = document.getElementById('email').value.trim();
        if (!email) {
            showToast("⚠️ يرجى إدخال البريد الإلكتروني أولاً");
            return;
        }

        this.setLoading(true);
        try {
            const { error } = await this.sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/build/html/profile.html?reset=true',
            });
            if (error) throw error;
            showToast("✅ تم إرسال رابط استعادة كلمة المرور لبريدك");
        } catch (err) {
            showToast("⚠️ " + this.translateError(err.message));
        } finally {
            this.setLoading(false);
        }
    },

    setLoading(loading) {
        if (!this.submitBtn) return;
        this.submitBtn.disabled = loading;
        this.submitBtn.style.opacity = loading ? "0.7" : "1";

        const icon = this.submitBtn.querySelector('i');
        if (icon) {
            icon.className = loading
                ? "fas fa-circle-notch fa-spin"
                : (this.isLogin ? "fas fa-sign-in-alt" : "fas fa-user-plus");
        }
    },

    translateError(msg) {
        const errors = {
            "Invalid login credentials": "بيانات الدخول غير صحيحة",
            "User already registered": "هذا البريد مسجل مسبقاً",
            "Password should be at least 6 characters": "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
            "provider is not enabled": "هذه الوسيلة غير مفعلة حالياً"
        };
        for (const [eng, ar] of Object.entries(errors)) {
            if (msg.includes(eng)) return ar;
        }
        return msg;
    }
};

/**
 * Global Toast System
 */
function showToast(message) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!t || !msgEl) return;

    msgEl.innerText = message;
    t.classList.replace('opacity-0', 'opacity-100');
    t.style.transform = 'translate(-50%, -20px)';

    setTimeout(() => {
        t.classList.replace('opacity-100', 'opacity-0');
        t.style.transform = 'translate(-50%, 0px)';
    }, 4000);
}

// Initial Kickoff
AuthUI.init();