/**
 * Leak Runner Audio — richer chiptune sequencer (Web Audio API).
 * Layered bass + lead + harmony, soft envelopes, audit alert mode.
 */

class LeakRunnerAudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.musicTimer = null;
        this.isMusicPlaying = false;
        this.isAudited = false;
        this.step = 0;
        this.pickupToggle = false;
        this.bpm = 128;
        this.threat = 0; // 0..1 — set by the engine as the sector empties
    }

    init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        // Soft lowpass so square waves aren't harsh
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 3200;
        this.filter.Q.value = 0.7;
        this.master.connect(this.filter);
        this.filter.connect(this.ctx.destination);
    }

    resume() {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    /**
     * Voice with ADSR-ish envelope through master bus.
     */
    playTone(frequency, type, duration, volume, slideTo = 0, when = 0) {
        this.resume();
        const t0 = (when || this.ctx.currentTime) + 0.001;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(40, frequency), t0);
        if (slideTo > 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
        }

        const atk = Math.min(0.02, duration * 0.15);
        const rel = Math.min(0.08, duration * 0.35);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t0 + atk);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(atk + 0.01, duration - rel));

        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
    }

    /** Short noise burst for percussion */
    playNoise(duration, volume, when = 0) {
        this.resume();
        const t0 = (when || this.ctx.currentTime) + 0.001;
        const len = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 1800;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        src.connect(filt);
        filt.connect(gain);
        gain.connect(this.master);
        src.start(t0);
        src.stop(t0 + duration + 0.02);
    }

    // Scale degrees in C minor-ish for "threat grid" vibe (Hz)
    note(semi) {
        return 220 * Math.pow(2, semi / 12); // A3 base
    }

    startMusic(isAudited = false) {
        this.resume();
        this.stopMusic();
        this.isMusicPlaying = true;
        this.isAudited = isAudited;
        this.step = 0;

        // Bass pattern (root motion)
        const bass = isAudited
            ? [0, 0, 3, 0, 5, 5, 3, 0, 0, 0, 7, 5, 3, 0, -2, 0]
            : [0, null, 0, 3, null, 3, 5, null, 0, null, 7, 5, 3, null, 0, -5];

        // Lead arpeggio (A section) + darker B section every other bar pair
        const leadA = isAudited
            ? [12, 15, 19, 15, 12, 15, 17, 19, 12, 10, 8, 10, 12, 15, 17, 19]
            : [12, null, 15, 12, 19, null, 15, 12, 17, null, 15, 12, 19, 15, 12, null];
        const leadB = isAudited
            ? [19, 17, 15, 17, 19, 20, 19, 17, 15, 14, 12, 14, 15, 17, 19, 22]
            : [8, null, 12, 8, 15, null, 12, 8, 10, null, 14, 10, 17, 15, 12, null];

        // Harmony (soft fifths)
        const harm = isAudited
            ? [7, null, 10, null, 12, null, 10, null, 7, null, 8, null, 10, null, 7, null]
            : [7, null, null, 7, 10, null, null, 10, 5, null, null, 5, 7, null, 3, null];

        const tick = () => {
            if (!this.isMusicPlaying || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            // Tempo climbs with sector threat (up to +26 bpm)
            const threat = Math.max(0, Math.min(1, this.threat || 0));
            this.bpm = (this.isAudited ? 148 : 126) + threat * 26;
            const stepMs = (60 / this.bpm) * 1000 / 2; // 8th notes

            const i = this.step % 16;
            const section = Math.floor(this.step / 32) % 2; // A A B B phrasing
            const lead = section === 0 ? leadA : leadB;
            const t = this.ctx.currentTime;

            // Kick on 0, 4, 8, 12
            if (i % 4 === 0) {
                this.playTone(90, 'sine', 0.12, 0.22, 45, t);
                this.playNoise(0.04, 0.06, t);
            }
            // Hat on offs — denser under high threat
            if (i % 2 === 1 || (threat > 0.6 && i % 4 === 2)) {
                this.playNoise(0.025, 0.035, t);
            }

            if (bass[i] !== null && bass[i] !== undefined) {
                this.playTone(this.note(bass[i] - 12), 'triangle', stepMs / 1000 * 0.9, 0.14, 0, t);
                // Sub-octave shadow when the grid is nearly stripped
                if (threat > 0.75) {
                    this.playTone(this.note(bass[i] - 24), 'sine', stepMs / 1000 * 0.9, 0.07, 0, t);
                }
            }
            if (lead[i] !== null && lead[i] !== undefined) {
                const vol = this.isAudited ? 0.09 : 0.07;
                this.playTone(this.note(lead[i]), 'square', stepMs / 1000 * 0.55, vol, 0, t);
            }
            if (harm[i] !== null && harm[i] !== undefined) {
                this.playTone(this.note(harm[i]), 'sine', stepMs / 1000 * 0.7, 0.05, 0, t);
            }

            // Rising siren accent: always in audit mode, creeping in at high threat
            if (i === 0 && (this.isAudited || threat > 0.55)) {
                const base = this.isAudited ? 400 : 300 + threat * 160;
                this.playTone(base, 'sawtooth', 0.2, this.isAudited ? 0.04 : 0.03, base + 300, t);
            }

            this.step++;
            this.musicTimer = setTimeout(tick, stepMs);
        };

        tick();
    }

    stopMusic() {
        if (this.musicTimer) {
            clearTimeout(this.musicTimer);
            this.musicTimer = null;
        }
        this.isMusicPlaying = false;
    }

    playHarvest() {
        this.resume();
        const freq = this.pickupToggle ? 520 : 380;
        this.pickupToggle = !this.pickupToggle;
        this.playTone(freq, 'triangle', 0.06, 0.12, freq * 0.7);
    }

    playSlash() {
        this.playPenguinScream(1, 0);
    }

    /**
     * Penguin death scream — descending squeal + chirp, pitch per foe.
     * @param {number} pitch
     * @param {number} [id]
     */
    playPenguinScream(pitch = 1, id = 0) {
        this.resume();
        const t = this.ctx.currentTime;
        const p = Math.max(0.7, Math.min(1.4, pitch));
        const base = [520, 480, 390, 610][id % 4] * p;

        // Sharp hit
        this.playTone(base * 1.4, 'square', 0.05, 0.16, base * 0.9, t);
        // Descending scream
        this.playTone(base, 'sawtooth', 0.22, 0.15, base * 0.35, t + 0.04);
        this.playTone(base * 0.75, 'triangle', 0.18, 0.1, base * 0.25, t + 0.12);
        // Cartoon chirp trail
        this.playTone(base * 1.8, 'square', 0.06, 0.1, base * 2.2, t + 0.22);
        this.playTone(base * 0.5, 'square', 0.1, 0.08, base * 0.2, t + 0.28);
        this.playNoise(0.08, 0.05, t + 0.02);
    }

    /**
     * Relic seize sting — unique color per relic key.
     * @param {string} [key]
     */
    playRelicSeize(key = 'spray') {
        this.resume();
        const t = this.ctx.currentTime;
        const voicing = {
            spray:     [660, 880, 1180],
            hook:      [392, 523, 784],
            amm:       [523, 659, 987],
            validator: [587, 740, 1175],
            consensus: [349, 523, 698, 1046]
        };
        const notes = voicing[key] || voicing.spray;
        notes.forEach((f, i) => {
            this.playTone(f, i % 2 ? 'triangle' : 'square', 0.11, 0.11, f * 1.05, t + i * 0.07);
        });
        this.playTone(notes[notes.length - 1] * 1.5, 'sine', 0.16, 0.08, notes[0], t + notes.length * 0.07);
    }

    playDeath() {
        this.stopMusic();
        this.resume();
        const t = this.ctx.currentTime;
        // Impact slam
        this.playTone(90, 'square', 0.14, 0.22, 40, t);
        this.playTone(180, 'sawtooth', 0.1, 0.18, 60, t + 0.04);
        // Descending breach wail
        for (let i = 0; i < 12; i++) {
            const f = 780 - i * 58;
            this.playTone(f, 'sawtooth', 0.085, 0.11, f - 140, t + 0.08 + i * 0.075);
        }
        // Final crack
        this.playTone(220, 'square', 0.08, 0.16, 55, t + 1.0);
        this.playTone(110, 'triangle', 0.12, 0.14, 40, t + 1.05);
    }

    playFruit() {
        this.resume();
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            this.playTone(f, 'square', 0.12, 0.1, 0, t + i * 0.09);
        });
    }

    playClick() {
        this.resume();
        this.playTone(880, 'sine', 0.05, 0.1, 440);
    }

    playStart() {
        this.resume();
        const t = this.ctx.currentTime;
        this.playTone(392, 'square', 0.1, 0.12, 0, t);
        this.playTone(523.25, 'square', 0.12, 0.12, 0, t + 0.1);
        this.playTone(659.25, 'square', 0.18, 0.14, 0, t + 0.22);
    }

    /** READY! jingle — plays over the frozen sector-intro card. */
    playReady() {
        this.resume();
        const t = this.ctx.currentTime;
        [330, 415, 494, 659].forEach((f, i) => {
            this.playTone(f, 'square', 0.13, 0.11, 0, t + i * 0.13);
        });
        // Closing chord
        this.playTone(659, 'square', 0.3, 0.09, 0, t + 0.56);
        this.playTone(494, 'triangle', 0.3, 0.08, 0, t + 0.56);
        this.playTone(330, 'triangle', 0.34, 0.07, 0, t + 0.56);
    }

    /** Sector sealed — triumphant sweep + fast victory arpeggio. */
    playSectorClear() {
        this.resume();
        const t = this.ctx.currentTime;
        this.playTone(220, 'sawtooth', 0.4, 0.07, 880, t);
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
            this.playTone(f, 'square', 0.1, 0.1, 0, t + 0.1 + i * 0.07);
        });
        this.playTone(1568, 'triangle', 0.35, 0.09, 1046.5, t + 0.56);
        this.playNoise(0.12, 0.05, t + 0.1);
    }

    /** Relic materialized — urgent double ping so you look at the pad. */
    playRelicSpawn() {
        this.resume();
        const t = this.ctx.currentTime;
        this.playTone(988, 'sine', 0.09, 0.11, 1318, t);
        this.playTone(988, 'sine', 0.09, 0.11, 1318, t + 0.16);
        this.playTone(1318, 'triangle', 0.14, 0.07, 988, t + 0.32);
    }

    playGameOver() {
        this.stopMusic();
        this.resume();
        const t = this.ctx.currentTime;
        [392, 349.23, 311.13, 261.63].forEach((f, i) => {
            this.playTone(f, 'square', 0.28, 0.14, 0, t + i * 0.28);
        });
    }
}

window.retroAudio = new LeakRunnerAudioEngine();
