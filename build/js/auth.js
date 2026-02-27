/**
 * يتلو | Yatlo Authentication Logic
 */

const AuthUI = {
    isLogin: true,
    form: document.getElementById('authForm'),
    submitBtn: document.getElementById('submitBtn'),
    toggleBtn: document.getElementById('toggleBtn'),
    subtitle: document.getElementById('authSubtitle'),
    toggleText: document.getElementById('toggleText'),

    init() {
        this.toggleBtn.addEventListener('click', () => this.toggleMode());
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    toggleMode() {
        this.isLogin = !this.isLogin;

        // Update UI Strings
        this.submitBtn.querySelector('span').innerText = this.isLogin ? "تسجيل الدخول" : "إنشاء حساب";
        this.subtitle.innerText = this.isLogin ? "قم بتسجيل الدخول لمتابعة حفظ أحاديثك" : "انضم إلينا وابدأ بحفظ أحاديثك الخاصة";
        this.toggleText.innerText = this.isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟";
        this.toggleBtn.innerText = this.isLogin ? "إنشاء حساب جديد" : "تسجيل الدخول";

        // Animation
        this.form.classList.add('opacity-50');
        setTimeout(() => this.form.classList.remove('opacity-50'), 200);
    },

    async handleSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        this.setLoading(true);

        try {
            if (this.isLogin) {
                const { data, error } = await HadithEngine.sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                window.location.href = '../html/profile.html';
            } else {
                const { data, error } = await HadithEngine.sb.auth.signUp({ email, password });
                if (error) throw error;
                showToast("✅ تم إنشاء الحساب! تفقد بريدك الإلكتروني");
            }
        } catch (err) {
            showToast("⚠️ " + this.translateError(err.message));
        } finally {
            this.setLoading(false);
        }
    },

    setLoading(loading) {
        this.submitBtn.disabled = loading;
        this.submitBtn.style.opacity = loading ? "0.7" : "1";
        this.submitBtn.querySelector('i').className = loading ? "fas fa-circle-notch fa-spin" : (this.isLogin ? "fas fa-sign-in-alt" : "fas fa-user-plus");
    },

    translateError(msg) {
        if (msg.includes("provider is not enabled")) {
            return "هذه الوسيلة غير مفعلة حالياً، يرجى المحاولة لاحقاً";
        }
        if (msg.includes("Invalid login credentials")) return "بيانات الدخول غير صحيحة";
        if (msg.includes("User already registered")) return "هذا البريد مسجل مسبقاً";
        // ... existing translations
        return msg;
    },

    /** * Add this method inside your AuthUI object in auth.js
 */
    async signInWithProvider(provider) {
        try {
            const { data, error } = await HadithEngine.sb.auth.signInWithOAuth({
                provider: provider,
                options: {
                    // Where to send the user after they login successfully
                    redirectTo: window.location.origin + '../html/profile.html'
                }
            });

            if (error) throw error;
        } catch (err) {
            showToast("⚠️ " + this.translateError(err.message));
        }
    },
};

// Reusing your existing toast function from index
function showToast(m) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    msgEl.innerText = m;
    t.classList.replace('opacity-0', 'opacity-100');
    t.classList.add('translate-y-[-20px]');
    setTimeout(() => {
        t.classList.replace('opacity-100', 'opacity-0');
        t.classList.remove('translate-y-[-20px]');
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => AuthUI.init());