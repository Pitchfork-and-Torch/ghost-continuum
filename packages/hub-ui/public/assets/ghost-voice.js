/**
 * Ghost Voice — Web Speech API (input + synthesis).
 * Calm, authoritative operator voice. Fully optional; degrades silently.
 */

const SYNTH_VOICES_PREFER = [/google us english/i, /microsoft (aria|zira|david)/i, /samantha/i, /alex/i];

export function createGhostVoice(options = {}) {
  const state = {
    enabled: true,
    listening: false,
    speaking: false,
    recognition: null,
    lastTranscript: '',
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = options.lang || 'en-US';
      rec.onresult = (ev) => {
        const text = ev.results?.[0]?.[0]?.transcript || '';
        state.lastTranscript = text;
        options.onResult?.(text);
      };
      rec.onerror = () => {
        state.listening = false;
        options.onListening?.(false);
      };
      rec.onend = () => {
        state.listening = false;
        options.onListening?.(false);
      };
      state.recognition = rec;
    } catch {
      state.recognition = null;
    }
  }

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    for (const re of SYNTH_VOICES_PREFER) {
      const v = voices.find((x) => re.test(x.name));
      if (v) return v;
    }
    return voices.find((v) => v.lang?.startsWith('en')) || voices[0] || null;
  }

  function speak(text, opts = {}) {
    if (!state.enabled || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 400));
      u.rate = opts.rate ?? 0.92;
      u.pitch = opts.pitch ?? 0.85;
      u.volume = opts.volume ?? 0.85;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.onstart = () => {
        state.speaking = true;
        options.onSpeaking?.(true);
      };
      u.onend = () => {
        state.speaking = false;
        options.onSpeaking?.(false);
      };
      u.onerror = () => {
        state.speaking = false;
        options.onSpeaking?.(false);
      };
      window.speechSynthesis.speak(u);
    } catch {
      state.speaking = false;
      options.onSpeaking?.(false);
    }
  }

  function startListening() {
    if (!state.recognition) {
      options.onError?.('Speech recognition not available in this browser');
      return false;
    }
    try {
      state.recognition.start();
      state.listening = true;
      options.onListening?.(true);
      return true;
    } catch {
      return false;
    }
  }

  function stopListening() {
    try {
      state.recognition?.stop();
    } catch {
      /* ignore */
    }
    state.listening = false;
    options.onListening?.(false);
  }

  function toggleListening() {
    if (state.listening) stopListening();
    else startListening();
  }

  // Chrome loads voices async
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => pickVoice();
  }

  return {
    speak,
    startListening,
    stopListening,
    toggleListening,
    isAvailable: () => Boolean(state.recognition || window.speechSynthesis),
    setEnabled(v) { state.enabled = !!v; },
    get listening() { return state.listening; },
    get speaking() { return state.speaking; },
  };
}

/** Narrate high-signal ops events in Ghost voice */
export function narrateEvent(voice, type, detail = {}) {
  if (!voice) return;
  const lines = {
    'morph-switch': `Sentinel morph set to ${detail.morph || 'unknown'}.`,
    'genome-evolved': `Evolution complete. New champion genome deployed.`,
    'demo-campaign': `Demo campaign injected. Reconstructing holographic map.`,
    breach: `Live breach path detected. Focusing containment vectors.`,
    probe: `New probe detected on edge plane. Morphing sentinel.`,
  };
  const line = lines[type];
  if (line) voice.speak(line);
}
