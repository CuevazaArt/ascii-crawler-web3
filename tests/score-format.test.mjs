import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatScoreText, formatScoreLabel, SCORE_MAX_CHARS } = require('../score-format.js');

test('formatScoreText keeps ASCII digits only and max 10 chars', () => {
    assert.equal(SCORE_MAX_CHARS, 10);
    assert.equal(formatScoreText(0), '0');
    assert.equal(formatScoreText(4540), '4540');
    assert.equal(formatScoreText(12345678901), '9999999999');
    assert.equal(formatScoreText(-5), '0');
    assert.equal(formatScoreText(9999999999).length, 10);
    assert.match(formatScoreText(42), /^[0-9]{1,10}$/);
});

test('formatScoreText pad option stays within 10 ASCII chars', () => {
    const padded = formatScoreText(42, { pad: 6 });
    assert.equal(padded, '000042');
    assert.ok(padded.length <= 10);
    for (const ch of padded) {
        assert.ok(ch.charCodeAt(0) <= 0x7f);
    }
});

test('formatScoreLabel strips non-ASCII and caps at 10', () => {
    const label = formatScoreLabel('café🎉superlongname');
    assert.ok(label.length <= 10);
    for (const ch of label) {
        const code = ch.charCodeAt(0);
        assert.ok(code >= 0x20 && code <= 0x7e);
    }
    assert.equal(formatScoreLabel('xrpl'), 'XRPL');
});
