/**
 * Procedural Retro Audio Synthesizer (audio.js)
 * Synthesizes classic 8-bit and 16-bit console-style chiptune music and sound effects (SFX)
 * in real-time using the HTML5 Web Audio API. Requires no asset downloads.
 */

class RetroAudioEngine {
    constructor() {
        this.ctx = null;
        this.musicInterval = null;
        this.isMusicPlaying = false;
        
        // Sequencer settings for dungeon background theme
        this.bpm = 100;
        this.step = 0;
        // Minor scale bassline for suspenseful dungeon vibe: A, C, D, F, E
        this.bassNotes = [55.00, 65.41, 73.42, 87.31, 82.41, 73.42, 65.41, 55.00]; // A1, C2, D2, F2, E2, D2, C2, A1
        this.melodyNotes = [110.00, 0, 130.81, 146.83, 0, 174.61, 164.81, 0];      // A2, C3, D3, F3, E3
    }

    init() {
        if (this.ctx) return;
        // Initialize AudioContext on user gesture
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    }

    // Play a single synthesized note
    playTone(frequency, type, duration, volume, slideTo = 0) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type; // 'square' (8-bit NES), 'triangle' (mellow bass), 'sawtooth' (rough Genesis), 'sine'
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        if (slideTo > 0) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        // Retro envelope (Attack, Decay, Sustain, Release)
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.02); // Quick attack
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); // Long release decay

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // Noise synthesizer for explosion/hit sounds
    playNoise(duration, volume) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Fill buffer with random white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // Bandpass filter to make it sound like a retro crunch/impact
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start();
        noiseNode.stop(this.ctx.currentTime + duration);
    }

    // Play procedural background music loop
    startMusic() {
        this.init();
        if (this.isMusicPlaying) return;
        this.isMusicPlaying = true;
        this.step = 0;

        const stepDuration = 60 / this.bpm / 2; // Eighth notes

        this.musicInterval = setInterval(() => {
            if (this.ctx.state === 'suspended') return;

            // 1. Play bassline step (triangle wave for smooth chiptune bass)
            const bassFreq = this.bassNotes[this.step % this.bassNotes.length];
            if (bassFreq > 0) {
                this.playTone(bassFreq, 'triangle', stepDuration * 0.9, 0.25);
            }

            // 2. Play simple arpeggiator/melody step (square wave for NES feel)
            if (this.step % 2 === 0) {
                const melodyFreq = this.melodyNotes[Math.floor(this.step / 2) % this.melodyNotes.length];
                if (melodyFreq > 0) {
                    this.playTone(melodyFreq * 2, 'square', stepDuration * 1.5, 0.08); // Octave higher
                }
            }

            this.step++;
        }, stepDuration * 1000);
    }

    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        this.isMusicPlaying = false;
    }

    // SFX: Quick click for UI interactions
    playClick() {
        this.playTone(600, 'sine', 0.08, 0.15, 300);
    }

    // SFX: Character steps
    playStep() {
        // Very subtle short white-noise crunch for footsteps
        this.playNoise(0.05, 0.03);
    }

    // SFX: Opening a golden chest (classic ascending arpeggio)
    playChest() {
        const time = this.ctx ? this.ctx.currentTime : 0;
        this.playTone(261.63, 'square', 0.1, 0.15); // C4
        setTimeout(() => this.playTone(329.63, 'square', 0.1, 0.15), 100); // E4
        setTimeout(() => this.playTone(392.00, 'square', 0.1, 0.15), 200); // G4
        setTimeout(() => this.playTone(523.25, 'square', 0.25, 0.18, 1046), 300); // C5 slide to C6
    }

    // SFX: Attack impact/combat
    playHit() {
        // Combine white noise crunch with a decaying square wave drop
        this.playNoise(0.2, 0.35);
        this.playTone(150, 'sawtooth', 0.15, 0.2, 40);
    }

    // SFX: Triggering a trap (fast descending whistle + crunch)
    playTrap() {
        this.playTone(800, 'sawtooth', 0.15, 0.25, 100);
        setTimeout(() => this.playNoise(0.25, 0.3), 80);
    }

    // SFX: Descending level stairs (cascading arpeggio)
    playStairs() {
        this.playTone(600, 'sine', 0.15, 0.15, 200);
        setTimeout(() => this.playTone(450, 'sine', 0.15, 0.15, 150), 120);
        setTimeout(() => this.playTone(300, 'sine', 0.3, 0.15, 100), 240);
    }

    // SFX: Game over melody
    playGameOver() {
        this.stopMusic();
        this.playTone(220, 'square', 0.25, 0.2); // A3
        setTimeout(() => this.playTone(207.65, 'square', 0.25, 0.2), 250); // G#3
        setTimeout(() => this.playTone(196.00, 'square', 0.25, 0.2), 500); // G3
        setTimeout(() => this.playTone(174.61, 'sawtooth', 0.6, 0.25, 80), 750); // F3 slide down
    }
}

// Global initialization
window.retroAudio = new RetroAudioEngine();
