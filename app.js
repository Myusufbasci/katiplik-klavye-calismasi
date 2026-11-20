const savedExamKey = 'zabit_saved_exam';
const state = {
  texts: [...OFFICIAL_PRACTICE_TEXTS],
  drill: null,
  previousText: null,
  currentTextIndex: 0,
  activeWords: [],
  currentWordIndex: 0,
  wordStatuses: [],
  userInputHistory: [],

  durationSeconds: 0,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  timerInterval: null,
  isStarted: false,
  isFinished: false,

  correctWordsCount: 0,
  wrongWordsCount: 0,
  totalKeystrokes: 0,

  soundEnabled: true,
  isInputHidden: false,
  fontSize: 24,

  audioCtx: null
};

const elements = {
  typingTextCard: document.getElementById('typingTextCard'),
  inputSection: document.getElementById('inputSection'),
  textDisplay: document.getElementById('textDisplay'),
  wordInput: document.getElementById('wordInput'),
  hideInputToggleBtn: document.getElementById('hideInputToggleBtn'),
  timerBadge: document.getElementById('timerBadge'),
  timerDisplay: document.getElementById('timerDisplay'),
  restartBtn: document.getElementById('restartBtn'),
  textSelect: document.getElementById('textSelect'),
  randomTextBtn: document.getElementById('randomTextBtn'),
  customTextBtn: document.getElementById('customTextBtn'),
  durationSelect: document.getElementById('durationSelect'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  fontIncBtn: document.getElementById('fontIncBtn'),
  fontDecBtn: document.getElementById('fontDecBtn'),
  wordProgressText: document.getElementById('wordProgressText'),

  liveCorrect: document.getElementById('liveCorrect'),
  liveWrong: document.getElementById('liveWrong'),
  liveTotal: document.getElementById('liveTotal'),
  liveWpm: document.getElementById('liveWpm'),
  liveKeystrokes: document.getElementById('liveKeystrokes'),
  liveAccuracy: document.getElementById('liveAccuracy'),
  progressBar: document.getElementById('progressBar'),
  progressTitle: document.getElementById('progressTitle'),
  targetStatusBadge: document.getElementById('targetStatusBadge'),

  resultModal: document.getElementById('resultModal'),
  closeResultBtn: document.getElementById('closeResultBtn'),
  restartFromModalBtn: document.getElementById('restartFromModalBtn'),
  nextTextFromModalBtn: document.getElementById('nextTextFromModalBtn'),
  modalDurationInfo: document.getElementById('modalDurationInfo'),
  customTextModal: document.getElementById('customTextModal'),
  saveCustomTextBtn: document.getElementById('saveCustomTextBtn'),
  cancelCustomTextBtn: document.getElementById('cancelCustomTextBtn'),
  customTextTitle: document.getElementById('customTextTitle'),
  customTextContent: document.getElementById('customTextContent')
};

function initAudio() {
  if (!state.audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      state.audioCtx = new AudioContext();
    }
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
}

function playTone(freq, type, duration, gainValue = 0.08) {
  if (!state.soundEnabled || !state.audioCtx) return;
  try {
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
    gain.gain.setValueAtTime(gainValue, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.start();
    osc.stop(state.audioCtx.currentTime + duration);
  } catch (e) {}
}

function playKeyClickSound() {
  playTone(550, 'triangle', 0.03, 0.03);
}

function playErrorSound() {
  playTone(220, 'sawtooth', 0.09, 0.08);
}

function playSuccessDing() {
  playTone(880, 'sine', 0.25, 0.08);
}

function loadCustomTexts() {
  try {
    const saved = localStorage.getItem('zabit_custom_texts');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.texts = [...OFFICIAL_PRACTICE_TEXTS, ...parsed.filter(text => text &&
          typeof text.content === 'string' && typeof text.title === 'string')];
      }
    }
  } catch (e) {
    console.error('Özel metin yükleme hatası', e);
  }
}

function saveExam() {
  if (state.drill) return;
  try {
    localStorage.setItem(savedExamKey, JSON.stringify({
      textId: (state.previousText || state.texts[state.currentTextIndex]).id,
      durationSeconds: state.durationSeconds,
      elapsedSeconds: state.elapsedSeconds,
      totalKeystrokes: state.totalKeystrokes,
      completedWords: state.userInputHistory.slice(0, state.currentWordIndex),
      partialWord: elements.wordInput.value
    }));
  } catch (e) {}
}

function restoreExam() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(savedExamKey));
  } catch (e) {
    return;
  }

  if (!saved || !Array.isArray(saved.completedWords) ||
      !saved.completedWords.every(word => typeof word === 'string' && word.length > 0) ||
      typeof saved.partialWord !== 'string' ||
      !Number.isSafeInteger(saved.totalKeystrokes) || saved.totalKeystrokes < 0 ||
      !Number.isSafeInteger(saved.elapsedSeconds) || saved.elapsedSeconds < 0 ||
      !Array.from(elements.durationSelect.options).some(option => Number(option.value) === saved.durationSeconds) ||
      (saved.durationSeconds > 0 && saved.elapsedSeconds > saved.durationSeconds)) return;

  const textIndex = state.texts.findIndex(text => text.id === saved.textId);
  if (textIndex === -1) {
    // Eski oturum kayıtları sayısal metin kimlikleri kullanır.
    const previousText = legacyPracticeTexts.find(text => text.id === saved.textId);
    if (!previousText || !(saved.elapsedSeconds || saved.completedWords.length || saved.partialWord)) return;
    state.previousText = previousText;
  }

  state.currentTextIndex = Math.max(0, textIndex);
  state.durationSeconds = saved.durationSeconds;
  state.remainingSeconds = state.durationSeconds;
  prepareCurrentText();
  if (saved.completedWords.length > state.activeWords.length) return;

  state.elapsedSeconds = saved.elapsedSeconds;
  state.remainingSeconds = Math.max(0, state.durationSeconds - state.elapsedSeconds);
  state.totalKeystrokes = saved.totalKeystrokes;
  saved.completedWords.forEach(recordWord);
  state.isFinished = (state.currentWordIndex > 0 && state.currentWordIndex === state.activeWords.length) ||
    (state.durationSeconds > 0 && state.remainingSeconds === 0);
  elements.wordInput.value = saved.partialWord;
}

function populateTextSelector() {
  elements.textSelect.replaceChildren();
  const groups = new Map();
  if (state.previousText) {
    const previous = new Option('Önceki alıştırma · kayıtlı oturum', 'previous', true, true);
    previous.disabled = true;
    elements.textSelect.append(previous);
  }
  state.texts.forEach((txt, idx) => {
    const category = txt.category || 'Özel Metin';
    if (!groups.has(category)) {
      const group = document.createElement('optgroup');
      group.label = category;
      groups.set(category, group);
      elements.textSelect.append(group);
    }
    groups.get(category).append(new Option(txt.title, String(idx)));
  });
  elements.textSelect.value = state.previousText ? 'previous' : state.currentTextIndex;
}

function prepareCurrentText() {
  const selected = state.drill || state.previousText || state.texts[state.currentTextIndex];
  let rawContent = selected.content;

  if (!selected.passageId) {
    rawContent = cleanTextForOfficialExam(rawContent);
  } else {
    rawContent = rawContent.replace(/\s+/g, ' ').trim();
  }

  state.activeWords = rawContent.split(' ').filter(w => w.trim().length > 0);
  state.currentWordIndex = 0;
  state.wordStatuses = new Array(state.activeWords.length).fill('pending');
  state.userInputHistory = new Array(state.activeWords.length).fill('');
}

function renderTextDisplay() {
  elements.textDisplay.innerHTML = '';
  const fragment = document.createDocumentFragment();

  state.activeWords.forEach((word, idx) => {
    const span = document.createElement('span');
    span.id = `word-${idx}`;
    span.className = 'word';
    span.textContent = word;

    if (idx < state.currentWordIndex) {
      span.classList.add(state.wordStatuses[idx] === 'correct' ? 'word-correct' : 'word-wrong');
    } else if (idx === state.currentWordIndex) {
      span.classList.add('word-active');
    } else {
      span.classList.add('word-pending');
    }

    fragment.appendChild(span);
    fragment.appendChild(document.createTextNode(' '));
  });

  elements.textDisplay.appendChild(fragment);
  elements.textDisplay.style.fontSize = `${state.fontSize}px`;
  elements.textDisplay.style.transform = 'translateY(0px)';

  scrollActiveWordIntoView();
}

// Etkin satırı, metin alanının üstünde tut.
function scrollActiveWordIntoView() {
  const visibleIndex = Math.min(state.currentWordIndex, state.activeWords.length - 1);
  const activeSpan = document.getElementById(`word-${visibleIndex}`);
  if (!activeSpan) return;

  const firstSpan = document.getElementById('word-0');
  if (!firstSpan) return;

  const baseTop = firstSpan.offsetTop;
  const currentTop = activeSpan.offsetTop;
  const lineOffset = Math.max(0, currentTop - baseTop);

  elements.textDisplay.style.transform = `translateY(-${lineOffset}px)`;
}

function startExam() {
  if (state.isStarted || state.isFinished) return;
  state.isStarted = true;

  if (state.drill?.spaced) return;
  if (!state.drill && !state.previousText) rememberPassage(state.texts[state.currentTextIndex].passageId);
  elements.timerBadge.classList.add('active');

  initAudio();

  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    if (state.durationSeconds > 0) {
      state.remainingSeconds--;
    }
    updateTimerDisplay();
    updateLiveStats();

    if (state.durationSeconds > 0 && state.remainingSeconds === 0) {
      finishExam();
    } else {
      saveExam();
    }
  }, 1000);
}

function pauseExam() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isStarted = false;
  elements.timerBadge.classList.remove('active');
}

function setupPracticeDialog(openButton, dialog, prepare) {
  let resumeExam = false;
  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    prepare();
    resumeExam = state.isStarted;
    if (resumeExam) pauseExam();
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (resumeExam) {
      startExam();
      elements.wordInput.focus();
    }
  });
}

function updateTimerDisplay() {
  if (state.durationSeconds === 0) {
    const mins = Math.floor(state.elapsedSeconds / 60);
    const secs = state.elapsedSeconds % 60;
    elements.timerDisplay.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    elements.timerBadge.classList.remove('urgent');
  } else {
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = state.remainingSeconds % 60;
    elements.timerDisplay.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (state.remainingSeconds <= 30 && state.remainingSeconds > 0) {
      elements.timerBadge.classList.add('urgent');
    } else {
      elements.timerBadge.classList.remove('urgent');
    }
  }
}

function resetExam({ persist = true } = {}) {
  if (state.previousText) {
    state.previousText = null;
    populateTextSelector();
  }
  pauseExam();
  state.isFinished = false;
  state.elapsedSeconds = 0;
  state.remainingSeconds = state.durationSeconds;

  state.correctWordsCount = 0;
  state.wrongWordsCount = 0;
  state.totalKeystrokes = 0;

  elements.wordInput.value = '';
  elements.timerBadge.classList.remove('active', 'urgent');
  elements.resultModal.close();

  prepareCurrentText();
  renderExam();
  if (persist) saveExam();
}

function renderExam() {
  elements.wordInput.disabled = state.isFinished;
  if (!state.isFinished && !elements.wordInput.closest('[hidden]')) elements.wordInput.focus();

  renderTextDisplay();
  updateInputFeedback();
  updateTimerDisplay();
  updateLiveStats();
  updateWordReviewProgress();
}

function updateWordReviewProgress() {
  const progress = document.getElementById('wordReviewProgress');
  progress.hidden = !state.drill?.spaced;
  if (state.drill?.spaced) progress.textContent = `${state.currentWordIndex} / ${state.activeWords.length} tekrar`;
}

function updateLiveStats() {
  const effectiveSeconds = Math.max(state.elapsedSeconds, 1);
  const effectiveMinutes = effectiveSeconds / 60;

  const totalTyped = state.correctWordsCount + state.wrongWordsCount;
  const wpm = Math.round(state.correctWordsCount / effectiveMinutes);
  const accuracy = totalTyped > 0 ? Math.round((state.correctWordsCount / totalTyped) * 100) : 100;

  elements.liveCorrect.textContent = state.correctWordsCount;
  elements.liveWrong.textContent = state.wrongWordsCount;
  elements.liveTotal.textContent = totalTyped;
  elements.liveWpm.textContent = wpm;
  elements.liveKeystrokes.textContent = state.totalKeystrokes;
  elements.liveAccuracy.textContent = `${accuracy}%`;

  const totalWords = state.activeWords.length;
  const currentIdx = state.currentWordIndex;
  const percent = totalWords > 0 ? Math.min(100, Math.round((currentIdx / totalWords) * 100)) : 0;

  if (elements.wordProgressText) {
    elements.wordProgressText.textContent = `${currentIdx} / ${totalWords} Kelime (%${percent})`;
  }

  if (state.durationSeconds === 0) {
    if (elements.progressTitle) elements.progressTitle.textContent = 'Metin Tamamlanma Durumu';
    elements.progressBar.style.width = `${percent}%`;
    elements.progressBar.style.backgroundColor = percent === 100 ? '#2e7d32' : '#0288d1';
    elements.targetStatusBadge.textContent = `%${percent} Tamamlandı (${currentIdx}/${totalWords})`;
    elements.targetStatusBadge.className = percent === 100 ? 'status-badge passed' : 'status-badge in-progress';
  } else {
    const timePercent = Math.min(100, state.elapsedSeconds / state.durationSeconds * 100);
    elements.progressTitle.textContent = 'Alıştırma süresi';
    elements.progressBar.style.width = `${timePercent}%`;
    elements.progressBar.style.backgroundColor = '#0288d1';
    elements.targetStatusBadge.textContent = state.isFinished ? 'Tur tamamlandı' : `${accuracy}% doğruluk`;
    elements.targetStatusBadge.className = 'status-badge in-progress';
  }
}

function finishExam() {
  pauseExam();
  const lastWord = elements.wordInput.value.trim();
  if (lastWord && state.activeWords[state.currentWordIndex] &&
      normalizeWord(lastWord) === normalizeWord(state.activeWords[state.currentWordIndex])) {
    recordWord(lastWord);
    elements.wordInput.value = '';
    renderTextDisplay();
  }
  state.isFinished = true;
  elements.wordInput.disabled = true;
  saveExam();
  updateLiveStats();
  const errors = state.activeWords.filter((_, index) => state.wordStatuses[index] === 'wrong');
  if (state.currentWordIndex && completeDailyStep(state.drill?.daily, errors)) {
    saveStudy();
    updatePlanViews();
  }
  rememberDifficultWords(errors);

  playSuccessDing();
  showResultModal();
}

function showResultModal() {
  const totalTyped = state.correctWordsCount + state.wrongWordsCount;
  const accuracy = totalTyped > 0 ? ((state.correctWordsCount / totalTyped) * 100).toFixed(1) : 0;
  const errorRate = totalTyped > 0 ? ((state.wrongWordsCount / totalTyped) * 100).toFixed(1) : 0;

  const effectiveSeconds = Math.max(state.elapsedSeconds, 1);
  const minutes = effectiveSeconds / 60;
  const dks = Math.round(state.correctWordsCount / minutes);

  const mins = Math.floor(state.elapsedSeconds / 60);
  const secs = state.elapsedSeconds % 60;
  const durationStr = `${mins} dakika ${secs} saniye`;

  const status = document.getElementById('resultStatusContainer');
  status.className = `result-badge-card ${Number(accuracy) >= 95 ? 'success' : 'warning'}`;
  status.textContent = state.drill ? 'Alıştırma tamamlandı.'
    : Number(accuracy) >= 95 ? 'Doğruluk hedefi karşılandı.' : 'Sonraki turda tempoyu düşür ve zor kelimelere odaklan.';
  elements.modalDurationInfo.textContent = durationStr;
  document.getElementById('modalTotalWords').textContent = totalTyped;
  document.getElementById('modalCorrectWords').textContent = state.correctWordsCount;
  document.getElementById('modalWrongWords').textContent = state.wrongWordsCount;
  document.getElementById('modalAccuracy').textContent = `${accuracy}%`;
  document.getElementById('modalErrorRate').textContent = `%${errorRate}`;
  document.getElementById('modalKeystrokes').textContent = state.totalKeystrokes;
  document.getElementById('modalDks').textContent = dks;

  elements.resultModal.classList.toggle('guided-result', Boolean(state.drill));
  elements.nextTextFromModalBtn.textContent = state.drill
    ? (state.drill.daily ? 'Bugüne dön' : 'Araçlara dön')
    : 'Sonraki metne geç';
  if (!elements.resultModal.open) elements.resultModal.showModal();
  elements.nextTextFromModalBtn.focus();
}

function handleInput() {
  if (state.isFinished) return;

  if (!state.isStarted) {
    startExam();
  }

  const rawValue = elements.wordInput.value;
  if (!state.activeWords[state.currentWordIndex]) return;

  if (rawValue.endsWith(' ')) {
    const typedWord = rawValue.trim();

    if (typedWord.length > 0) {
      commitWord(typedWord);
      return;
    }
    elements.wordInput.value = '';
  }

  updateInputFeedback(true);
  saveExam();
}

function normalizeWord(word) {
  return word.toLocaleLowerCase('tr-TR');
}

function updateInputFeedback(playSound = false) {
  const currentSpan = document.getElementById(`word-${state.currentWordIndex}`);
  const currentWord = state.activeWords[state.currentWordIndex];
  const typedPrefix = normalizeWord(elements.wordInput.value);
  const hasError = Boolean(currentWord && !normalizeWord(currentWord).startsWith(typedPrefix));

  currentSpan?.classList.toggle('has-error', hasError);
  elements.wordInput.classList.toggle('input-error', hasError);

  if (playSound && typedPrefix) {
    if (hasError) playErrorSound();
    else playKeyClickSound();
  }
}

function recordWord(typedWord) {
  const currentWord = state.activeWords[state.currentWordIndex];
  const isExactMatch = normalizeWord(typedWord) === normalizeWord(currentWord);

  if (isExactMatch) {
    state.wordStatuses[state.currentWordIndex] = 'correct';
    state.correctWordsCount++;

  } else {
    state.wordStatuses[state.currentWordIndex] = 'wrong';
    state.wrongWordsCount++;

  }

  state.userInputHistory[state.currentWordIndex] = typedWord;
  state.currentWordIndex++;
}

function commitWord(typedWord) {
  const index = state.currentWordIndex;
  if (state.drill?.spaced && normalizeWord(typedWord) !== normalizeWord(state.activeWords[index])) {
    elements.wordInput.value = typedWord;
    const updatedWords = registerReviewError(state.drill.daily, state.activeWords[index], index);
    if (updatedWords) {
      state.drill.content = updatedWords.join(' ');
      state.activeWords = updatedWords;
      renderTextDisplay();
      updateWordReviewProgress();
    }
    document.getElementById(`word-${index}`).classList.add('has-error');
    elements.wordInput.classList.add('input-error');
    return;
  }
  const currentSpan = document.getElementById(`word-${index}`);
  recordWord(typedWord);
  if (state.drill?.spaced) {
    saveWordReviewProgress(state.drill.daily, state.currentWordIndex);
    updateWordReviewProgress();
  }

  currentSpan.classList.remove('word-active', 'has-error');
  currentSpan.classList.add(`word-${state.wordStatuses[index]}`);
  elements.wordInput.classList.remove('input-error');
  elements.wordInput.value = '';

  if (state.currentWordIndex < state.activeWords.length) {
    const nextSpan = document.getElementById(`word-${state.currentWordIndex}`);
    if (nextSpan) {
      nextSpan.classList.remove('word-pending');
      nextSpan.classList.add('word-active');
    }
    scrollActiveWordIntoView();
    saveExam();
  } else {
    finishExam();
  }

  updateLiveStats();
}

function handleKeyDown(e) {
  initAudio();

  if (e.key === 'Backspace') {
    return;
  }

  if (e.key.length === 1) {
    state.totalKeystrokes++;
  }
}

function setupEventListeners() {
  elements.wordInput.addEventListener('input', handleInput);
  elements.wordInput.addEventListener('keydown', handleKeyDown);

  elements.restartBtn.addEventListener('click', resetExam);
  const dismissResult = () => {
    elements.resultModal.close();
    if (state.drill?.daily) showPlanView('today');
  };
  elements.closeResultBtn.addEventListener('click', dismissResult);
  elements.resultModal.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismissResult();
  });
  elements.restartFromModalBtn.addEventListener('click', () => {
    resetExam();
  });
  elements.nextTextFromModalBtn.addEventListener('click', () => {
    elements.resultModal.close();
    if (state.drill) showPlanView(state.drill.daily ? 'today' : 'tools');
    else selectNextText();
  });

  elements.textSelect.addEventListener('change', (e) => {
    state.drill = null;
    state.currentTextIndex = parseInt(e.target.value, 10);
    resetExam();
  });

  elements.randomTextBtn.addEventListener('click', () => {
    state.drill = null;
    const rand = Math.floor(Math.random() * state.texts.length);
    state.currentTextIndex = rand;
    elements.textSelect.value = rand;
    resetExam();
  });

  elements.durationSelect.addEventListener('change', (e) => {
    state.drill = null;
    const val = parseInt(e.target.value, 10);
    state.durationSeconds = val;
    state.remainingSeconds = val;
    resetExam();
  });

  elements.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    elements.soundToggleBtn.classList.toggle('active', state.soundEnabled);
    elements.soundToggleBtn.innerHTML = state.soundEnabled ? '🔊' : '🔇';
  });

  elements.fontIncBtn.addEventListener('click', () => {
    if (state.fontSize < 36) {
      state.fontSize += 2;
      elements.textDisplay.style.fontSize = `${state.fontSize}px`;
      setTimeout(scrollActiveWordIntoView, 50);
    }
  });

  elements.fontDecBtn.addEventListener('click', () => {
    if (state.fontSize > 16) {
      state.fontSize -= 2;
      elements.textDisplay.style.fontSize = `${state.fontSize}px`;
      setTimeout(scrollActiveWordIntoView, 50);
    }
  });

  window.addEventListener('resize', () => {
    scrollActiveWordIntoView();
  });

  elements.customTextBtn.addEventListener('click', () => {
    elements.customTextModal.classList.add('open');
    elements.customTextTitle.value = '';
    elements.customTextContent.value = '';
    elements.customTextTitle.focus();
  });

  elements.cancelCustomTextBtn.addEventListener('click', () => {
    elements.customTextModal.classList.remove('open');
  });

  elements.saveCustomTextBtn.addEventListener('click', () => {
    const title = elements.customTextTitle.value.trim() || 'Özel Çalışma Metni';
    const content = elements.customTextContent.value.trim();

    if (content.length < 20) {
      alert('Lütfen en az 20 karakterlik bir metin giriniz.');
      return;
    }

    const newText = {
      id: Date.now(),
      title: title,
      category: 'Özel Metin',
      content: content
    };

    state.drill = null;
    state.texts.push(newText);
    try {
      const saved = JSON.parse(localStorage.getItem('zabit_custom_texts') || '[]');
      saved.push(newText);
      localStorage.setItem('zabit_custom_texts', JSON.stringify(saved));
    } catch (e) {
      console.error(e);
    }

    populateTextSelector();
    state.currentTextIndex = state.texts.length - 1;
    elements.textSelect.value = state.currentTextIndex;
    elements.customTextModal.classList.remove('open');
    resetExam();
  });

  if (elements.hideInputToggleBtn) {
    elements.hideInputToggleBtn.addEventListener('click', toggleInputVisibility);
  }

  document.addEventListener('click', (e) => {
    if (!elements.wordInput.closest('[hidden]') && !e.target.closest('button, select, textarea, .modal-content, a, dialog')) {
      elements.wordInput.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!elements.wordInput.closest('[hidden]') && !document.querySelector('dialog[open]') && e.target !== elements.wordInput &&
        !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) {
      if (e.key.length === 1 || e.key === 'Backspace') {
        elements.wordInput.focus();
      }
    }
  });
}

function toggleInputVisibility() {
  state.isInputHidden = !state.isInputHidden;
  try {
    localStorage.setItem('zabit_hide_input', state.isInputHidden ? '1' : '0');
  } catch (e) {}
  applyInputVisibility();
  elements.wordInput.focus();
}

function applyInputVisibility() {
  const inputSection = elements.inputSection || document.getElementById('inputSection');
  const textCard = elements.typingTextCard || document.getElementById('typingTextCard');
  const btn = elements.hideInputToggleBtn;

  if (state.isInputHidden) {
    if (inputSection) inputSection.classList.add('hide-typed');
    if (textCard) textCard.classList.add('input-hidden');
    if (btn) {
      btn.innerHTML = '👁️‍🗨️ Yazılan Gizli';
      btn.classList.add('toggle-active');
      btn.title = 'Yazılanları tekrar açmak için tıklayın';
    }
  } else {
    if (inputSection) inputSection.classList.remove('hide-typed');
    if (textCard) textCard.classList.remove('input-hidden');
    if (btn) {
      btn.innerHTML = '👁️ Yazılanı Gizle';
      btn.classList.remove('toggle-active');
      btn.title = 'Yazdıklarınızı kapatır, gözleriniz sadece metinde kalır';
    }
  }
}

function selectNextText() {
  state.drill = null;
  state.currentTextIndex = (state.currentTextIndex + 1) % state.texts.length;
  elements.textSelect.value = state.currentTextIndex;
  resetExam();
}

function startGuidedDrill(drill, resumeAt = 0) {
  state.drill = drill;
  state.durationSeconds = drill.seconds;
  elements.durationSelect.value = drill.seconds;
  resetExam();
  if (resumeAt > 0) {
    state.activeWords.slice(0, resumeAt).forEach(recordWord);
    renderExam();
  }
}

function restoreFreePractice() {
  state.drill = null;
  state.durationSeconds = 0;
  resetExam({ persist: false });
  restoreExam();
  populateTextSelector();
  elements.durationSelect.value = state.durationSeconds;
  renderExam();
}

function initApp() {
  loadCustomTexts();
  prepareCurrentText();
  restoreExam();
  populateTextSelector();
  elements.durationSelect.value = state.durationSeconds;

  try {
    const savedHide = localStorage.getItem('zabit_hide_input');
    if (savedHide === '1') {
      state.isInputHidden = true;
    }
  } catch (e) {}
  applyInputVisibility();

  setupEventListeners();
  setupDailyLetters();
  setupLetterPositions();
  renderExam();
}

document.addEventListener('DOMContentLoaded', initApp);
