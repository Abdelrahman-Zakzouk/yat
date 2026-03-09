/**
 * Bayani | Quran Foundation API Client
 * Provides unified access to Quran APIs for Verses, Chapters, Audio, Tafsirs, etc.
 */

const QURAN_API_BASE = 'https://api.quran.com/api/v4';

/**
 * Make an API request to Quran API
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {object} options - Request options (params, etc.)
 * @returns {Promise<object>} API response
 */
window.quranApiCall = async function(endpoint, options = {}) {
    try {
        const url = new URL(endpoint.startsWith('http') ? endpoint : `${QURAN_API_BASE}${endpoint}`);
        
        // Add query parameters if provided
        if (options.params) {
            Object.entries(options.params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    url.searchParams.append(key, value);
                }
            });
        }

        const response = await fetch(url.toString(), {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Quran API Error:', error);
        throw error;
    }
};

// ============================================
// CONTENT APIS - Verses, Chapters, Audio, etc.
// ============================================

/**
 * Get all chapters
 */
window.quranGetChapters = async function(options = {}) {
    return quranApiCall('/chapters', { params: options });
};

/**
 * Get chapter by number
 */
window.quranGetChapter = async function(chapterNumber, options = {}) {
    return quranApiCall(`/chapters/${chapterNumber}`, { params: options });
};

/**
 * Get chapter info (pre-Islamic name, revelation place, etc.)
 */
window.quranGetChapterInfo = async function(chapterNumber, languageCode = 'en') {
    return quranApiCall(`/chapters/${chapterNumber}/info`, {
        params: { language: languageCode }
    });
};

/**
 * Get verses by chapter number with Uthmani text
 */
window.quranGetVersesByChapter = async function(chapterNumber, options = {}) {
    // Get verses with text resources
    return quranApiCall(`/verses/by_chapter/${chapterNumber}`, { 
        params: {
            fields: 'text_uthmani,text_imlaei,translations,verse_key,verse_number',
            ...options.params
        }
    });
};

/**
 * Get verse by key (format: "1:1" for Chapter:Verse)
 */
window.quranGetVerseByKey = async function(verseKey, options = {}) {
    return quranApiCall(`/verses/by_key/${verseKey}`, { params: options });
};

/**
 * Get verses by range (format: "1:1-1:10")
 */
window.quranGetVersesByRange = async function(range, options = {}) {
    return quranApiCall(`/verses/by_range/${range}`, { params: options });
};

/**
 * Get verses by Juz (part) number
 */
window.quranGetVersesByJuz = async function(juzNumber, options = {}) {
    return quranApiCall(`/juzs/${juzNumber}/verses`, { params: options });
};

/**
 * Get verses by Hizb (section) number
 */
window.quranGetVersesByHizb = async function(hizbNumber, options = {}) {
    return quranApiCall(`/hizbs/${hizbNumber}/verses`, { params: options });
};

/**
 * Get verses by Manzil (reading level)
 */
window.quranGetVersesByManzil = async function(manzilNumber, options = {}) {
    return quranApiCall(`/manzils/${manzilNumber}/verses`, { params: options });
};

/**
 * Get verses by page number (Madani Mushaf)
 */
/**
 * Get verses by page (Madani Mushaf page number)
 */
window.quranGetVersesByPage = async function(pageNumber, options = {}) {
    return quranApiCall(`/verses/by_page/${pageNumber}`, { params: options });
};

/**
 * Get verses by Ruku (verse section)
 */
window.quranGetVersesByRuku = async function(rukuNumber, options = {}) {
    return quranApiCall(`/rukus/${rukuNumber}/verses`, { params: options });
};

/**
 * Get a random verse
 */
window.quranGetRandomVerse = async function() {
    return quranApiCall('/verses/random');
};

/**
 * Get all translations available
 */
window.quranGetTranslations = async function() {
    return quranApiCall('/resources/translations');
};

/**
 * Get all tafsirs available
 */
window.quranGetTafsirs = async function() {
    return quranApiCall('/resources/tafsirs');
};

/**
 * Get all reciters/recitations available
 */
window.quranGetRecitations = async function(options = {}) {
    return quranApiCall('/resources/recitations', { params: options });
};

/**
 * Get translations for a specific verse
 */
window.quranGetVerseTranslations = async function(verseKey, options = {}) {
    return quranApiCall(`/verses/${verseKey}/translations`, { params: options });
};

/**
 * Get tafsirs for a specific verse
 */
window.quranGetVerseTafsirs = async function(verseKey, options = {}) {
    return quranApiCall(`/verses/${verseKey}/tafsirs`, { params: options });
};

/**
 * Get audio recitations for a specific verse
 */
window.quranGetVerseRecitations = async function(verseKey, options = {}) {
    return quranApiCall(`/verses/${verseKey}/recitations`, { params: options });
};

/**
 * Get audio file URL for a reciter's chapter
 */
window.quranGetChapterAudio = async function(chapterNumber, reciterId, options = {}) {
    return quranApiCall(`/chapter_recitations/${reciterId}/${chapterNumber}`, { params: options });
};

/**
 * Get all audio files for a reciter
 */
window.quranGetRecitationAudioFiles = async function(recitationId, options = {}) {
    return quranApiCall(`/recitations/${recitationId}/audio_files`, { params: options });
};

// ============================================
// SEARCH APIs
// ============================================

/**
 * Search the Quran content
 * @param {string} query - Search query
 * @param {object} options - Options: { language, translationId, tafsirId, size, offset }
 */
window.quranSearch = async function(query, options = {}) {
    return quranApiCall('/search', {
        params: {
            q: query,
            size: options.size || 20,
            offset: options.offset || 0,
            language: options.language || 'en',
            ...options
        }
    });
};

// ============================================
// USER APIs (Requires Authentication)
// ============================================

/**
 * Get user profile
 * @param {string} accessToken - OAuth access token
 */
window.quranGetUserProfile = async function(accessToken) {
    return quranApiCall('/profile', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
};

/**
 * Get user bookmarks
 * @param {string} accessToken - OAuth access token
 */
window.quranGetUserBookmarks = async function(accessToken, options = {}) {
    return quranApiCall('/bookmarks', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: options
    });
};

/**
 * Add a bookmark
 * @param {string} accessToken - OAuth access token
 * @param {string} verseKey - Verse to bookmark (format: "1:1")
 * @param {object} collection - Collection info (optional)
 */
window.quranAddBookmark = async function(accessToken, verseKey, collection = {}) {
    return quranApiCall('/bookmarks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
            verse_key: verseKey,
            collection_id: collection.id || null
        }
    });
};

/**
 * Delete a bookmark
 * @param {string} accessToken - OAuth access token
 * @param {number} bookmarkId - Bookmark ID to delete
 */
window.quranDeleteBookmark = async function(accessToken, bookmarkId) {
    return quranApiCall(`/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
    });
};

/**
 * Get user notes
 * @param {string} accessToken - OAuth access token
 */
window.quranGetUserNotes = async function(accessToken, options = {}) {
    return quranApiCall('/notes', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: options
    });
};

/**
 * Add a note
 * @param {string} accessToken - OAuth access token
 * @param {string} verseKey - Verse key (format: "1:1")
 * @param {string} text - Note text
 */
window.quranAddNote = async function(accessToken, verseKey, text) {
    return quranApiCall('/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
            verse_key: verseKey,
            text: text
        }
    });
};

/**
 * Update a note
 * @param {string} accessToken - OAuth access token
 * @param {number} noteId - Note ID
 * @param {string} text - Updated note text
 */
window.quranUpdateNote = async function(accessToken, noteId, text) {
    return quranApiCall(`/notes/${noteId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { text }
    });
};

/**
 * Delete a note
 * @param {string} accessToken - OAuth access token
 * @param {number} noteId - Note ID
 */
window.quranDeleteNote = async function(accessToken, noteId) {
    return quranApiCall(`/notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
    });
};

/**
 * Get reading sessions
 * @param {string} accessToken - OAuth access token
 */
window.quranGetReadingSessions = async function(accessToken, options = {}) {
    return quranApiCall('/reading-sessions', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: options
    });
};

/**
 * Add/update reading session
 * @param {string} accessToken - OAuth access token
 * @param {string} verseKey - Verse key
 * @param {number} readingDurationInSeconds - Reading duration
 */
window.quranAddReadingSession = async function(accessToken, verseKey, readingDurationInSeconds = 0) {
    return quranApiCall('/reading-sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
            verse_key: verseKey,
            reading_duration_in_seconds: readingDurationInSeconds
        }
    });
};

/**
 * Get user collections
 * @param {string} accessToken - OAuth access token
 */
window.quranGetCollections = async function(accessToken) {
    return quranApiCall('/collections', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
};

/**
 * Create a collection
 * @param {string} accessToken - OAuth access token
 * @param {string} name - Collection name
 * @param {string} description - Collection description (optional)
 */
window.quranCreateCollection = async function(accessToken, name, description = '') {
    return quranApiCall('/collections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { name, description }
    });
};

/**
 * Get collection items
 * @param {string} accessToken - OAuth access token
 * @param {number} collectionId - Collection ID
 */
window.quranGetCollectionItems = async function(accessToken, collectionId) {
    return quranApiCall(`/collections/${collectionId}/bookmarks`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format verse key for display (e.g., "1:1" -> "1:1")
 */
window.formatVerseKey = function(verseKey) {
    return verseKey;
};

/**
 * Parse verse key into chapter and verse numbers
 */
window.parseVerseKey = function(verseKey) {
    const [chapter, verse] = verseKey.split(':').map(Number);
    return { chapter, verse };
};

/**
 * Get verse range from start to end
 */
window.quranGetVerseRange = async function(startKey, endKey, options = {}) {
    const start = parseVerseKey(startKey);
    const end = parseVerseKey(endKey);
    const rangeStr = `${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
    return quranGetVersesByRange(rangeStr, options);
};

/**
 * Batch fetch multiple verses
 */
window.quranGetMultipleVerses = async function(verseKeys, options = {}) {
    return Promise.all(verseKeys.map(key => quranGetVerseByKey(key, options)));
};

/**
 * Get chapter and all its verses
 */
window.quranGetChapterFull = async function(chapterNumber, options = {}) {
    const [chapter, verses] = await Promise.all([
        quranGetChapter(chapterNumber),
        quranGetVersesByChapter(chapterNumber, options)
    ]);
    return { chapter, verses };
};

// Make all functions available globally
window.quranApiCall = quranApiCall;
