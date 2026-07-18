import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers.mjs';

const ROWS = 17;
const COLS = 29;
const TUNNEL_ROW = 8;
const START = { r: 15, c: 14 };

function isWalkable(ch) {
    return ch !== undefined && ch !== '#' && ch !== 'H';
}

function neighbors(layout, r, c) {
    const out = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr;
        let nc = c + dc;
        if (dr === 0 && (nc < 0 || nc >= COLS)) {
            if (r !== TUNNEL_ROW) continue;
            nc = (nc + COLS) % COLS;
        }
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (isWalkable(layout[nr][nc])) out.push([nr, nc]);
    }
    return out;
}

function getMazes() {
    const { window } = loadApp();
    return window.MAZE_LAYOUTS;
}

test('MAZE_LAYOUTS has 3 mazes of 17×29', () => {
    const mazes = getMazes();
    assert.equal(mazes.length, 3);
    for (const [mi, maze] of mazes.entries()) {
        assert.equal(maze.length, ROWS, `maze ${mi} row count`);
        for (const [ri, row] of maze.entries()) {
            assert.equal(row.length, COLS, `maze ${mi} row ${ri} width (${row.length}): "${row}"`);
        }
    }
});

test('borders sealed, tunnel open on row 8 only', () => {
    for (const [mi, maze] of getMazes().entries()) {
        assert.match(maze[0], /^#+$/, `maze ${mi} top border`);
        assert.match(maze[ROWS - 1], /^#+$/, `maze ${mi} bottom border`);
        for (let r = 1; r < ROWS - 1; r++) {
            if (r === TUNNEL_ROW) {
                assert.equal(maze[r][0], ' ', `maze ${mi} tunnel left`);
                assert.equal(maze[r][COLS - 1], ' ', `maze ${mi} tunnel right`);
            } else {
                assert.equal(maze[r][0], '#', `maze ${mi} left wall row ${r}`);
                assert.equal(maze[r][COLS - 1], '#', `maze ${mi} right wall row ${r}`);
            }
        }
    }
});

test('Exploit house, exit lane, and relic pad are intact', () => {
    for (const [mi, maze] of getMazes().entries()) {
        for (let r = 7; r <= 9; r++) {
            assert.equal(maze[r].slice(12, 17), 'HHHHH', `maze ${mi} house row ${r}`);
            assert.equal(maze[r][11], '#', `maze ${mi} house wall L row ${r}`);
            assert.equal(maze[r][17], '#', `maze ${mi} house wall R row ${r}`);
        }
        assert.equal(maze[10].slice(10, 19), '#########', `maze ${mi} house floor`);
        assert.equal(maze[6][14], '=', `maze ${mi} house exit`);
        assert.ok(isWalkable(maze[5][14]), `maze ${mi} lane above exit`);
        assert.equal(maze[11][14], '=', `maze ${mi} relic pad`);
        assert.ok(isWalkable(maze[START.r][START.c]), `maze ${mi} player start`);
    }
});

test('every drop and cert is reachable from the player start', () => {
    for (const [mi, maze] of getMazes().entries()) {
        const seen = new Set([`${START.r},${START.c}`]);
        const queue = [[START.r, START.c]];
        while (queue.length) {
            const [r, c] = queue.shift();
            for (const [nr, nc] of neighbors(maze, r, c)) {
                const k = `${nr},${nc}`;
                if (!seen.has(k)) { seen.add(k); queue.push([nr, nc]); }
            }
        }
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const ch = maze[r][c];
                if (ch === '.' || ch === 'O') {
                    assert.ok(seen.has(`${r},${c}`), `maze ${mi} unreachable ${ch} at r${r} c${c}`);
                }
            }
        }
    }
});

test('no dead-end corridors (every open tile has ≥2 exits)', () => {
    for (const [mi, maze] of getMazes().entries()) {
        for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!isWalkable(maze[r][c])) continue;
                const n = neighbors(maze, r, c).length;
                assert.ok(n >= 2, `maze ${mi} dead-end at r${r} c${c} (${n} exits)`);
            }
        }
    }
});

test('each maze offers 4 audit certs and a healthy drop count', () => {
    for (const [mi, maze] of getMazes().entries()) {
        const flat = maze.join('');
        const certs = (flat.match(/O/g) || []).length;
        const drops = (flat.match(/\./g) || []).length;
        assert.equal(certs, 4, `maze ${mi} certs`);
        assert.ok(drops >= 150, `maze ${mi} drops (${drops})`);
    }
});
