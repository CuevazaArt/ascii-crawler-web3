/**
 * Procedural Retro Audio Synthesizer (audio.js)
 * Synthesizes classic Pac-Man chiptune loops, sirens, waka-waka sounds, and death sequences
 * in real-time using the HTML5 Web Audio API. Requires no asset downloads.
 */

class PacmanAudioEngine {
    constructor() {
        this.ctx = null;
        this.musicInterval = null;
        this.isMusicPlaying = false;
        
        // Sequencer properties
        this.step = 0;
        this.sirenPhase = 0;
        this.wakaToggle = false;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    }

    playTone(frequency, type, duration, volume, slideTo = 0) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        if (slideTo > 0) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // Background classic siren sound generator
    startMusic(isFrightened = false) {
        this.init();
        if (this.isMusicPlaying) this.stopMusic();
        this.isMusicPlaying = true;
        this.step = 0;

        const intervalMs = isFrightened ? 120 : 150;

        this.musicInterval = setInterval(() => {
            if (this.ctx.state === 'suspended') return;

            // Synthesis of a cyclic sweeping siren frequency
            let freq;
            if (isFrightened) {
                // Alternating high-low alarm during power pellets
                freq = this.step % 2 === 0 ? 300 : 200;
                this.playTone(freq, 'square', intervalMs / 1000 * 0.9, 0.03);
            } else {
                // Classic rising and falling siren sweep
                const angle = (this.step % 16) / 16 * Math.PI * 2;
                freq = 250 + Math.sin(angle) * 70;
                this.playTone(freq, 'triangle', intervalMs / 1000 * 0.95, 0.08);
            }

            this.step++;
        }, intervalMs);
    }

    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        this.isMusicPlaying = false;
    }

    // Classic "waka-waka" chew sound effect
    playWaka() {
        if (!this.ctx) this.init();
        
        // Alternating pitch to create "wa" and "ka" mouth movements
        const freq = this.wakaToggle ? 320 : 240;
        this.wakaToggle = !this.wakaToggle;

        this.playTone(freq, 'triangle', 0.08, 0.18, freq - 50);
    }

    // Play sound when eating a ghost (arpeggio blast)
    playEatGhost() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        this.playTone(200, 'sawtooth', 0.1, 0.25, 400);
        setTimeout(() => this.playTone(400, 'sawtooth', 0.1, 0.25, 800), 80);
        setTimeout(() => this.playTone(800, 'sawtooth', 0.1, 0.25, 1600), 160);
    }

    // Play sound when losing a life (descending spring whistle)
    playDeath() {
        this.stopMusic();
        
        // Classic cascading descending frequency sweeps
        let delay = 0;
        for (let i = 0; i < 12; i++) {
            const startFreq = 800 - i * 60;
            const endFreq = startFreq - 150;
            setTimeout(() => {
                this.playTone(startFreq, 'sawtooth', 0.08, 0.2, endFreq);
            }, delay);
            delay += 90;
        }
    }

    // Play fruit pickup chime
    playFruit() {
        this.playTone(440, 'square', 0.1, 0.15);
        setTimeout(() => this.playTone(554.37, 'square', 0.1, 0.15), 100);
        setTimeout(() => this.playTone(659.25, 'square', 0.2, 0.18), 200);
    }

    // Play click for UI buttons
    playClick() {
        this.playTone(523.25, 'sine', 0.08, 0.15, 261);
    }

    // Play standard retro game over chime
    playGameOver() {
        this.stopMusic();
        this.playTone(392, 'square', 0.3, 0.2); // G4
        setTimeout(() => this.playTone(349.23, 'square', 0.3, 0.2), 300); // F4
        setTimeout(() => this.playTone(311.13, 'square', 0.3, 0.2), 600); // Eb4
        setTimeout(() => this.playTone(261.63, 'square', 0.6, 0.25), 900); // C4
    }
}

window.retroAudio = new PacmanAudioEngine();
