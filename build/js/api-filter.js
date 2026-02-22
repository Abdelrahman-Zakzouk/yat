// build/js/api-filter.js

const HAMZA_OVERRIDES = {
    "النبإ": "النبأ",
    "سبإ": "سبأ",
    "الانسان": "الإنسان",
    "الإنفطار": "الانفطار",
    "الإنشقاق": "الانشقاق",
};

/**
 * Global filter function - Works on strings, arrays, or objects
 */
function applyHamzaFilter(data) {
    if (typeof data === 'string') {
        let corrected = data;
        for (const [wrong, right] of Object.entries(HAMZA_OVERRIDES)) {
            corrected = corrected.split(wrong).join(right);
        }
        return corrected;
    } else if (Array.isArray(data)) {
        return data.map(item => applyHamzaFilter(item));
    } else if (typeof data === 'object' && data !== null) {
        const cleaned = {};
        for (const key in data) {
            cleaned[key] = applyHamzaFilter(data[key]);
        }
        return cleaned;
    }
    return data;
}

// Make it available globally
window.applyHamzaFilter = applyHamzaFilter;