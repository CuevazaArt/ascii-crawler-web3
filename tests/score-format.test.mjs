import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatScoreText, formatScoreLabel, SCORE_MAX_CHARS } = require('../score-format.js');

test('formatScoreText keeps ASCII digits only and max 12 chars', () => {
    assert.equal(SCORE_MAX_CHARS, 12);
    assert.equal(formatScoreText(0), '0');
    assert.equal(formatScoreText(4540), '4540');
    assert.equal(formatScoreText(1234567890123), '999999999999');
    assert.equal(formatScoreText(-5), '0');
    assert.equal(formatScoreText(999999999999).length, 12);
    assert.match(formatScoreText(42), /^[0-9]{1,12}$/);
});

test('formatScoreText pad option stays within 12 ASCII chars', () => {
    const padded = formatScoreText(42, { pad: 6 });
    assert.equal(padded, '000042');
    assert.ok(padded.length <= 12);
    for (const ch of padded) {
        assert.ok(ch.charCodeAt(0) <= 0x7f);
    }
});

test('formatScoreLabel strips non-ASCII and caps at 12', () => {
    const label = formatScoreLabel('café🎉superlongnamehere');
    assert.ok(label.length <= 12);
    for (const ch of label) {
        const code = ch.charCodeAt(0);
        assert.ok(code >= 0x20 && code <= 0x7e);
    }
    assert.equal(formatScoreLabel('CUEVAZAART'), 'CUEVAZAART');
    assert.equal(formatScoreLabel('xrpl'), 'XRPL');
});
