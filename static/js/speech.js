/**
 * speech.js
 * Wraps the Web Speech API.
 *  - Speech-to-Text  via SpeechRecognition  (mic input, free, browser-native)
 *  - Text-to-Speech  via SpeechSynthesis     (voice output, free, browser-native)
 */

const Speech = (() => {

  let recognition = null;
  let isRecording = false;
  let isSpeaking  = false;

  const synth = window.speechSynthesis;

  // Voices load asynchronously on Chrome — return a Promise that resolves once ready.
  function getVoices() {
    return new Promise(resolve => {
      const v = synth.getVoices();
      if (v.length) { resolve(v); return; }
      synth.onvoiceschanged = () => resolve(synth.getVoices());
    });
  }

  function selectBestVoice(voices, langInfo) {
    const prefix  = langInfo.voicePrefix.toLowerCase();
    const bcp47lc = langInfo.bcp47.toLowerCase();

    const matches = voices
      .map(v => ({
        voice: v,
        lang: v.lang.toLowerCase(),
        name: v.name.toLowerCase(),
      }))
      .filter(({ lang }) => lang === bcp47lc || lang.startsWith(prefix));

    if (!matches.length) {
      return null;
    }

    const preferredTerms = [
      'google', 'microsoft', 'premium', 'narrator', 'alloy',
      'nora', 'samantha', 'daniel', 'emma', 'joanna', 'amy', 'zira',
      'felix', 'olivia', 'matthew', 'salli', 'alloy', 'jonathan', 'kendra',
    ];

    return matches
      .map(({ voice, lang, name }) => {
        let score = 0;
        if (lang === bcp47lc) score += 20;
        if (voice.default) score += 5;
        if (lang.startsWith(prefix) && lang !== bcp47lc) score += 5;
        if (langInfo.voicePrefix === 'en' && name.includes('english')) score += 4;
        preferredTerms.forEach(term => {
          if (name.includes(term)) score += 3;
        });
        return { voice, score };
      })
      .sort((a, b) => b.score - a.score)[0].voice;
  }

  // ── Getters ────────────────────────────────────────────────────────────
  const getIsRecording = () => isRecording;
  const getIsSpeaking  = () => isSpeaking;
  const isSTTSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ── Speech Recognition (STT) ───────────────────────────────────────────
  /**
   * Start recording from the microphone.
   * @param {Object} callbacks — onStart, onInterim, onFinal, onError, onEnd
   */
  function startRecognition({ onStart, onInterim, onFinal, onError, onEnd, lang } = {}) {
    if (!isSTTSupported()) {
      onError?.('Voice input not supported. Please use Chrome or Edge.');
      return;
    }

    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = true;
    recognition.lang           = lang || '';   // empty = browser auto-detects

    recognition.lang           = lang || '';

    recognition.onstart = () => {
      isRecording = true;
      onStart?.();
    };

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      const isFinal    = e.results[e.results.length - 1].isFinal;

      if (isFinal) {
        stopRecognition();
        onFinal?.(transcript);
      } else {
        onInterim?.(transcript);
      }
    };

    recognition.onerror = (e) => {
      stopRecognition();
      const msgs = {
        'not-allowed': 'Microphone access denied. Please allow mic permissions.',
        'no-speech':   'No speech detected. Please try again.',
        'network':     'Network error during speech recognition.',
        'aborted':     'Recording stopped.',
      };
      onError?.(msgs[e.error] || `Recognition error: ${e.error}`);
    };

    recognition.onend = () => {
      if (isRecording) stopRecognition();
      onEnd?.();
    };

    recognition.start();
  }

  function stopRecognition() {
    isRecording = false;
    try { recognition?.stop(); } catch (_) {}
  }

  // ── Text-to-Speech (TTS) ───────────────────────────────────────────────
  /**
   * Speak text aloud using the browser's built-in TTS.
   * @param {string}  text       — text to speak
   * @param {object}  langInfo   — { bcp47, voicePrefix } from /languages
   * @param {number}  rate       — speech rate (0.8 slow / 1 normal / 1.25 fast)
   * @param {object}  callbacks  — onStart, onEnd
   */
  async function speak(text, langInfo, rate, { onStart, onEnd, onNoVoice } = {}) {
    if (isSpeaking) synth.cancel();

    const voices = await getVoices();

    const matched = selectBestVoice(voices, langInfo);
    if (!matched) {
      onNoVoice?.(`No ${langInfo.name} (${langInfo.bcp47}) voice found. Install one via your OS settings.`);
      onEnd?.();
      return;
    }

    const utter  = new SpeechSynthesisUtterance(text);
    const defaultRate = langInfo.voicePrefix === 'en' ? 0.85 : 0.95;
    utter.rate   = Math.max(0.75, Math.min(rate || defaultRate, 1.0));
    utter.pitch  = 1.05;
    utter.volume = 1;
    utter.lang   = langInfo.bcp47;
    utter.voice  = matched;

    utter.onstart = () => { isSpeaking = true; onStart?.(); };

    const done = () => { isSpeaking = false; onEnd?.(); };
    utter.onend   = done;
    utter.onerror = done;

    synth.speak(utter);
  }

  function stopSpeaking() {
    synth.cancel();
    isSpeaking = false;
  }

  return {
    isSTTSupported,
    startRecognition,
    stopRecognition,
    speak,
    stopSpeaking,
    getIsRecording,
    getIsSpeaking,
  };

})();
