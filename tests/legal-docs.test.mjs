import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoot } from './helpers.mjs';

const REQUIRED_PHRASES = [
    'Disclaimer',
    'AS IS',
    'MIT License',
    'Terms of Service',
    'fair play',
    'hate',
    'discrimination',
    'racism',
    'harmful',
    'Accept'
];

test('LICENSE is MIT', () => {
    const license = readRoot('LICENSE');
    assert.match(license, /MIT License/i);
    assert.match(license, /AS IS/i);
});

test('docs/LEGAL.md covers disclaimer, license, ToS, and good-use clauses', () => {
    const legal = readRoot('docs', 'LEGAL.md');
    for (const phrase of REQUIRED_PHRASES) {
        assert.match(legal, new RegExp(phrase, 'i'), `missing: ${phrase}`);
    }
    assert.match(legal, /no.*incite|Incite/i);
    assert.match(legal, /not affiliated/i);
    assert.match(legal, /Bitwaddle|Hatglide|Slipkernel|Sourceflip/);
    assert.match(legal, /Linux Foundation|Tux/i);
    assert.match(legal, /real XRP/i);
    assert.match(legal, /irreversib/i);
    assert.match(legal, /no guaranteed refund/i);
});

test('docs/legal.html is the in-game readable legal page', () => {
    const html = readRoot('docs', 'legal.html');
    assert.match(html, /Terms of Service/i);
    assert.match(html, /discrimination/i);
    assert.match(html, /racism/i);
    assert.match(html, /MIT/i);
    assert.match(html, /real XRP/i);
    assert.match(html, /irreversib/i);
});

test('README links legal docs', () => {
    const readme = readRoot('README.md');
    assert.match(readme, /docs\/LEGAL\.md/);
    assert.match(readme, /LICENSE/);
});

test('index.html wires Legal link, GitHub repo, Demo Mode header, and ToS modal', () => {
    const html = readRoot('index.html');
    assert.match(html, /id="btn-legal-docs"/);
    assert.match(html, /href="docs\/legal\.html"/);
    assert.match(html, /id="btn-github-repo"/);
    assert.match(html, /github\.com\/CuevazaArt\/ascii-crawler-web3/);
    assert.match(html, /header-demo-toggle/);
    assert.match(html, /id="tos-modal"/);
    assert.match(html, /id="btn-tos-accept"/);
    assert.match(html, /id="btn-tos-decline"/);
    assert.match(html, /id="chk-tos-agree"/);
    assert.match(html, /score-format\.js/);
    assert.match(html, /attract-disclaimer/);
    assert.match(html, /mainnet XRP charges|MAINNET MAY CHARGE REAL XRP/i);
});

test('docs reference the public GitHub repository', () => {
    const legal = readRoot('docs', 'LEGAL.md');
    const readme = readRoot('README.md');
    assert.match(legal, /github\.com\/CuevazaArt\/ascii-crawler-web3/);
    assert.match(readme, /github\.com\/CuevazaArt\/ascii-crawler-web3/);
});
