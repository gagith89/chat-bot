/**
 * app.js
 * Main application controller.
 * - Fetches language config from the Python backend (/languages)
 * - Manages conversation history
 * - Sends messages to the Python backend (/chat)
 * - Wires UI and Speech together
 */

// ── State ──────────────────────────────────────────────────────────────────
let languages           = {};   // populated from /languages on load
let conversationHistory  = [];  // [{ role, content }, ...]
let selectedInputLang    = 'auto';
const MAX_HISTORY        = 20;

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  await loadLanguages();
  bindEvents();
}

// ── Load language config from backend ─────────────────────────────────────
async function loadLanguages() {
  try {
    const res = await fetch('/languages');
    languages = await res.json();
    UI.renderLangBadges(languages);
    UI.renderInputLangOptions(languages);
  } catch (e) {
    UI.setStatus('error', '✗ Could not load language config. Is the server running?');
  }
}

// ── Event Binding ──────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('mic-btn')
    .addEventListener('click', toggleMic);

  document.getElementById('send-btn')
    .addEventListener('click', sendTextMessage);

  document.getElementById('input-lang-select')
    .addEventListener('change', (e) => {
      selectedInputLang = e.target.value;
    });

  document.getElementById('text-input')
    .addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });
}

// ── Mic Toggle ─────────────────────────────────────────────────────────────
function toggleMic() {
  if (Speech.getIsSpeaking()) {
    Speech.stopSpeaking();
  }

  if (Speech.getIsRecording()) {
    Speech.stopRecognition();
    UI.setMicRecording(false);
    UI.setTranscript('Tap the mic to start speaking…');
    UI.setStatus('', 'ready');
  } else {
    startListening();
  }
}

function startListening() {
  if (!Speech.isSTTSupported()) {
    UI.setStatus('error', '✗ Voice input not supported — please use Chrome or Edge.');
    return;
  }

  Speech.startRecognition({
    lang: selectedInputLang !== 'auto' && languages[selectedInputLang]
      ? languages[selectedInputLang].bcp47
      : '',
    onStart: () => {
      UI.setMicRecording(true);
      UI.setTranscript('🔴 Listening — speak now…', 'listening');
      UI.setStatus('', '🎤 Recording');
    },
    onInterim: (text) => {
      UI.setTranscript(text, 'active');
    },
    onFinal: (text) => {
      UI.setMicRecording(false);
      UI.setTranscript(text, 'active');
      handleUserMessage(text);
    },
    onError: (message) => {
      UI.setMicRecording(false);
      UI.setTranscript('Tap the mic to start speaking…');
      UI.setStatus('error', `✗ ${message}`);
    },
    onEnd: () => {
      UI.setMicRecording(false);
    },
  });
}

// ── Text Input ─────────────────────────────────────────────────────────────
function sendTextMessage() {
  const text = UI.getTextInputValue();
  if (!text) return;
  UI.clearTextInput();
  handleUserMessage(text);
}

// ── Core Message Flow ──────────────────────────────────────────────────────
async function handleUserMessage(text) {
  if (!text.trim()) return;

  selectedInputLang = UI.getTextInputLang();
  const effectiveInputLang = selectedInputLang !== 'auto' && languages[selectedInputLang]
    ? selectedInputLang
    : guessLangCodeFromText(text);

  // Add user message to history and show bubble
  conversationHistory.push({ role: 'user', content: text });
  const userLangInfo = languages[effectiveInputLang] || guessLangInfoFromText(text);
  const userBubbleEl = UI.addBubble('user', text, userLangInfo);

  UI.setInputsDisabled(true);
  UI.setStatus('thinking', '⟳ Thinking…');

  try {
    // Send full conversation history to Python backend
    const res = await fetch('/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: conversationHistory, inputLang: effectiveInputLang }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    // data = { reply, lang, langInfo, translation, userTranslation }

    conversationHistory.push({ role: 'assistant', content: data.reply });

    // Trim history to avoid growing token cost indefinitely
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    UI.addTranslation(userBubbleEl, data.userTranslation);

    const msgEl = UI.addBubble('ai', data.reply, data.langInfo, (playBtn) => {
      handlePlayButton(data.reply, data.langInfo, playBtn);
    }, data.translation, data.sourceText);

    UI.setTranscript('Tap the mic to speak again…');
    UI.setStatus('', 'ready');

    if (UI.getAutoSpeak()) {
      const playBtn = msgEl.querySelector('.play-btn');
      speakReply(data.reply, data.langInfo, playBtn);
    }

  } catch (error) {
    // Remove failed user message from history
    conversationHistory.pop();
    UI.setStatus('error', `✗ ${error.message}`);
    UI.setTranscript('Something went wrong. Check the terminal for details.');
  }

  UI.setInputsDisabled(false);
}

// ── TTS ────────────────────────────────────────────────────────────────────
function speakReply(text, langInfo, playBtn) {
  Speech.speak(text, langInfo, UI.getVoiceSpeed(), {
    onStart: () => {
      UI.setStatus('speaking', '🔊 Speaking…');
      UI.setPlayBtnState(playBtn, true);
    },
    onEnd: () => {
      UI.setStatus('', 'ready');
      UI.setPlayBtnState(playBtn, false);
    },
    onNoVoice: (msg) => {
      UI.setStatus('error', `✗ ${msg}`);
      UI.setPlayBtnState(playBtn, false);
    },
  });
}

function handlePlayButton(text, langInfo, playBtn) {
  if (Speech.getIsSpeaking()) {
    Speech.stopSpeaking();
    UI.setPlayBtnState(playBtn, false);
    UI.setStatus('', 'ready');
  } else {
    speakReply(text, langInfo, playBtn);
  }
}

// ── Utility: best-guess lang info before server responds ───────────────────
// Used only for showing the user bubble immediately (before /chat returns).
function guessLangCodeFromText(text) {
  if (/[一-鿿㐀-䶿豈-﫿]/.test(text))
    return 'zh';

  if (/[àâæçéèêëîïôœùûüÿ]/i.test(text) ||
      /\b(je|tu|il|elle|nous|vous|ils|elles|est|sont|avec|pour|dans|que|qui|pas|sur|une|les|des|mon|ton|son|bonjour|merci|oui|non|bonsoir|salut|comment|va)\b/i.test(text))
    return 'fr';

  if (/[áéíóúüñ¿¡]/i.test(text) ||
      /\b(yo|ella|nosotros|ellos|con|para|hola|gracias|buenos|dias|buenas|estas|tengo|quiero)\b/i.test(text))
    return 'es';

  return 'en';
}

function guessLangInfoFromText(text) {
  // Mirrors server-side detection: special chars first, then common words.
  if (selectedInputLang !== 'auto' && languages[selectedInputLang]) {
    return languages[selectedInputLang];
  }

  const code = guessLangCodeFromText(text);
  return languages[code] || fallbackLang();
}

function fallbackLang() {
  return { flag: '🌐', label: '??' };
}

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
