/**
 * Score display helpers — ASCII-only, max 12 characters.
 * Shared by lobby HUD, attract mode, and ledger UI.
 */
(function (root) {
    var SCORE_MAX_CHARS = 12;
    var SCORE_MAX_VALUE = 999999999999; // fits in 12 ASCII digits

    /**
     * Format a numeric score for UI: ASCII digits only, ≤ 12 chars.
     * @param {*} value
     * @param {{ pad?: number }} [opts]
     */
    function formatScoreText(value, opts) {
        opts = opts || {};
        var n = Number(value);
        if (!isFinite(n) || n < 0) n = 0;
        n = Math.min(SCORE_MAX_VALUE, Math.floor(n));
        var s = String(n).replace(/[^\x30-\x39]/g, '');
        if (!s) s = '0';
        var pad = opts.pad | 0;
        if (pad > 0) {
            pad = Math.min(pad, SCORE_MAX_CHARS);
            while (s.length < pad) s = '0' + s;
        }
        if (s.length > SCORE_MAX_CHARS) s = s.slice(0, SCORE_MAX_CHARS);
        return s;
    }

    /**
     * Sanitize free-form score-related labels (names, tags) to ASCII ≤ 12.
     * @param {*} text
     */
    function formatScoreLabel(text) {
        var s = String(text == null ? '' : text)
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/\s+/g, '')
            .toUpperCase();
        if (!s) s = 'NODE';
        return s.slice(0, SCORE_MAX_CHARS);
    }

    var api = {
        SCORE_MAX_CHARS: SCORE_MAX_CHARS,
        SCORE_MAX_VALUE: SCORE_MAX_VALUE,
        formatScoreText: formatScoreText,
        formatScoreLabel: formatScoreLabel
    };

    root.formatScoreText = formatScoreText;
    root.formatScoreLabel = formatScoreLabel;
    root.ScoreFormat = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
