(() => {
  'use strict';

  const STORAGE_KEY = 'stack-rush-sound';
  let ctx = null;

  // Default: muted. AudioContext is never created unless the player explicitly enables sound.
  let enabled = localStorage.getItem(STORAGE_KEY) === 'on';

  function getCtx() {
    if (!enabled) return null;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = 'sine', vol = 0.12) {
    if (!enabled) return;
    try {
      const ac = getCtx();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch (_) { /* silent */ }
  }

  const noop = () => {};

  window.GameAudio = {
    isEnabled() { return enabled; },

    setEnabled(on) {
      enabled = !!on;
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
      if (!enabled && ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },

    toggle() {
      this.setEnabled(!enabled);
      return enabled;
    },

    // No-op init — never auto-creates AudioContext
    init: noop,

    drop: noop,
    good: noop,
    great: noop,
    perfect: noop,
    golden: noop,
    milestone: noop,
    gameOver: noop,
    newRecord: noop,
  };

  // Wire up real sound methods only when explicitly enabled
  function bindSound(name, fn) {
    window.GameAudio[name] = function (...args) {
      if (!enabled) return;
      fn(...args);
    };
  }

  bindSound('drop', () => tone(180, 0.08, 'triangle', 0.08));
  bindSound('good', () => tone(330, 0.1, 'sine', 0.1));
  bindSound('great', () => {
    tone(440, 0.12, 'sine', 0.11);
    setTimeout(() => tone(550, 0.08, 'sine', 0.08), 50);
  });
  bindSound('perfect', (combo) => {
    const base = 660 + Math.min(combo, 10) * 30;
    tone(base, 0.15, 'sine', 0.12);
    setTimeout(() => tone(base * 1.25, 0.1, 'sine', 0.09), 60);
  });
  bindSound('golden', () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'sine', 0.1), i * 70));
  });
  bindSound('milestone', () => {
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'square', 0.06), i * 80));
  });
  bindSound('gameOver', () => {
    tone(220, 0.3, 'sawtooth', 0.1);
    setTimeout(() => tone(165, 0.4, 'sawtooth', 0.08), 150);
  });
  bindSound('newRecord', () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.1), i * 100));
  });
})();
