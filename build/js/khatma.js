const SUPABASE_URL = 'https://ruokjdtnpraaglmewjwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqCbpZBE9aT0Tv0AY3A_6Q_utNzCQA-';
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TOTAL_QURAN_VERSES = 6236;

async function init() {
    const { data, error } = await sbClient
        .from('khatma_progress')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

    if (data) {
        renderDashboard(data);
    } else {
        document.getElementById('khatmaDashboard').innerHTML = `
            <div class="khatma-card">
                <p style="color: #94a3b8; margin-bottom: 20px;">لا يوجد رحلة نشطة حالياً، ابدأ رحلتك لنور القرآن.</p>
                <button onclick="openSetupModal()" class="action-btn primary" style="width: 100%">ابدأ رحلة جديدة</button>
            </div>`;
    }
}

function renderDashboard(data) {
    const container = document.getElementById('khatmaDashboard');
    const percent = (data.completed_verses / TOTAL_QURAN_VERSES) * 100;

    // Circle math: 2 * PI * R (R=70) ≈ 440
    const circumference = 440;
    const offset = circumference - (percent / 100) * circumference;

    const startDate = new Date(data.start_date);
    const today = new Date();
    const elapsed = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)) || 1;

    const remainingDays = Math.max(1, data.target_days - elapsed);
    const remainingVerses = TOTAL_QURAN_VERSES - data.completed_verses;
    const dailyQuota = Math.ceil(remainingVerses / remainingDays);

    container.innerHTML = `
        <div class="khatma-card">
            <div class="progress-section">
                <svg class="progress-circle-svg" viewBox="0 0 160 160">
                    <circle class="progress-bg" cx="80" cy="80" r="70"></circle>
                    <circle class="progress-bar" cx="80" cy="80" r="70" 
                            style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${circumference}"></circle>
                </svg>
                <div class="percentage-label">${percent.toFixed(1)}%</div>
            </div>

            <div class="stats-row">
                <div class="stat-box">
                    <span class="val">${remainingVerses}</span>
                    <span class="lbl">آية متبقية</span>
                </div>
                <div class="stat-box">
                    <span class="val">${dailyQuota}</span>
                    <span class="lbl">آية / يومياً</span>
                </div>
            </div>

            <button class="action-btn primary" style="width:100%; margin-top:25px;"
                    onclick="window.location.href='../index.html?verse=${data.last_verse_key}'">
                متابعة من آية ${data.last_verse_key}
            </button>
        </div>
    `;

    // Trigger animation after render
    setTimeout(() => {
        const bar = container.querySelector('.progress-bar');
        if (bar) bar.style.strokeDashoffset = offset;
    }, 100);
}

async function createNewJourney(days) {
    // 1. Deactivate old
    await sbClient.from('khatma_progress').update({ is_active: false }).eq('is_active', true);

    // 2. Insert new
    const { error } = await sbClient.from('khatma_progress').insert([
        {
            target_days: days,
            completed_verses: 0,
            last_verse_key: '1:1',
            is_active: true,
            start_date: new Date().toISOString()
        }
    ]);

    if (!error) {
        closeSetupModal();
        init();
    } else {
        console.error(error);
    }
}

function openSetupModal() { document.getElementById('setupKhatmaModal').classList.remove('hidden'); }
function closeSetupModal() { document.getElementById('setupKhatmaModal').classList.add('hidden'); }

init();