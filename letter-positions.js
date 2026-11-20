function setupLetterPositions() {
  const dialog = document.getElementById('letterPositionsDialog');
  const openButton = document.getElementById('letterPositionsBtn');
  const practice = document.getElementById('letterPositionsPractice');
  const keyboard = document.getElementById('letterKeyboard');
  const target = document.getElementById('letterPositionTarget');
  const name = document.getElementById('letterPositionName');
  const progress = document.getElementById('letterPositionProgress');
  const feedback = document.getElementById('letterPositionFeedback');
  const results = document.getElementById('letterPositionResults');
  const summary = document.getElementById('letterPositionSummary');
  const roundErrors = document.getElementById('letterPositionErrors');
  const historyList = document.getElementById('letterPositionHistory');
  const historyStatus = document.getElementById('letterPositionHistoryStatus');
  const resetHistoryButton = document.getElementById('resetLetterPositionHistory');
  const restartButton = document.getElementById('restartLetterPositions');
  const historyKey = 'zabit_letter_position_history';

  const letters = Object.keys(turkishLetterNames);
  let round;
  let position = 0;
  let errors = {};
  let missedKey;
  let history = {};

  buildTurkishQKeyboard(keyboard, true);

  function renderQuestion() {
    const letter = round[position];
    target.textContent = letter === 'l' ? 'L' : letter;
    name.textContent = turkishLetterNames[letter];
    progress.textContent = `${position + 1} / ${round.length}`;
    feedback.textContent = '';
  }

  function startRound() {
    round = shuffledLetters(letters);
    position = 0;
    errors = {};
    practice.hidden = false;
    results.hidden = true;
    renderQuestion();
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey));
      if (validPracticeErrorCounts(saved)) history = saved;
    } catch (e) {}
  }

  function saveHistory(counts) {
    try {
      localStorage.setItem(historyKey, JSON.stringify(counts));
      return true;
    } catch (e) {
      return false;
    }
  }

  function renderHistory() {
    renderPracticeErrors(historyList, history, 5, 'Geçmişte kayıtlı hata yok.');
    resetHistoryButton.disabled = Object.keys(history).length === 0;
  }

  function finishRound() {
    loadHistory();
    const misses = Object.values(errors).reduce((total, count) => total + count, 0);
    historyStatus.textContent = '';
    if (misses > 0) {
      for (const [letter, count] of Object.entries(errors)) {
        history[letter] = (history[letter] || 0) + count;
      }
      if (!saveHistory(history)) historyStatus.textContent = 'Hata geçmişi kaydedilemedi.';
    }

    practice.hidden = true;
    results.hidden = false;
    summary.textContent = `${round.length} harfin yerini buldun. ${misses} yanlış seçim.`;
    renderPracticeErrors(roundErrors, errors);
    renderHistory();
    restartButton.focus();
  }

  setupPracticeDialog(openButton, dialog, () => {
    if (!round) startRound();
  });

  restartButton.addEventListener('click', () => {
    startRound();
    keyboard.querySelector('button').focus();
  });

  resetHistoryButton.addEventListener('click', () => {
    if (!window.confirm('Harf Yerleri testinin birikmiş hata geçmişi silinecek. Bu turun özeti kalacak. Geçmişi sıfırlamak istiyor musun?')) return;
    if (!saveHistory({})) {
      historyStatus.textContent = 'Geçmiş sıfırlanamadı.';
      return;
    }
    history = {};
    renderHistory();
    historyStatus.textContent = 'Hata geçmişi sıfırlandı.';
  });

  window.addEventListener('storage', event => {
    if (event.key === historyKey && !results.hidden) {
      loadHistory();
      renderHistory();
    }
  });

  keyboard.addEventListener('click', event => {
    const key = event.target.closest('.letter-key');
    if (!key || !dialog.open || position >= round.length) return;

    missedKey?.classList.remove('letter-key-missed');
    missedKey = null;
    const letter = round[position];
    if (key.dataset.letter !== letter) {
      errors[letter] = (errors[letter] || 0) + 1;
      missedKey = key;
      key.classList.add('letter-key-missed');
      feedback.textContent = 'Yanlış tuş. Aynı harfi tekrar dene.';
      return;
    }

    position++;
    if (position < round.length) {
      renderQuestion();
      return;
    }

    finishRound();
  });
}
