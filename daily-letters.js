const turkishLetterNames = {
    a: 'a harfi', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e harfi',
    f: 'fe', g: 'ge', ğ: 'yumuşak ge', h: 'he', ı: 'noktasız ı', i: 'noktalı i',
    j: 'je', k: 'ke', l: 'le', m: 'me', n: 'ne', o: 'o harfi', ö: 'ö harfi',
    p: 'pe', r: 're', s: 'se', ş: 'şe', t: 'te', u: 'u harfi', ü: 'ü harfi',
    v: 've', y: 'ye', z: 'ze'
};

function shuffledLetters(alphabet) {
  const letters = [...alphabet];
  for (let index = letters.length - 1; index > 0; index--) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [letters[index], letters[otherIndex]] = [letters[otherIndex], letters[index]];
  }
  return letters;
}

function validPracticeErrorCounts(counts) {
  return counts && typeof counts === 'object' && !Array.isArray(counts) &&
    Object.entries(counts).every(([letter, count]) =>
      Object.hasOwn(turkishLetterNames, letter) && Number.isSafeInteger(count) && count > 0
    );
}

function practiceLetterLabel(letter) {
  const name = turkishLetterNames[letter];
  return name ? `“${letter}” (${name})` : `“${letter}”`;
}

function renderPracticeErrors(list, counts, limit = Infinity, emptyMessage = 'Hata yok.') {
  const sorted = Object.entries(counts)
    .sort(([left, leftCount], [right, rightCount]) =>
      rightCount - leftCount || left.localeCompare(right, 'tr-TR')
    );
  list.replaceChildren();
  for (const [letter, count] of sorted.slice(0, limit)) {
    const item = document.createElement('li');
    item.textContent = `${practiceLetterLabel(letter)} · ${count} hata`;
    list.append(item);
  }
  if (sorted.length === 0) {
    const item = document.createElement('li');
    item.textContent = emptyMessage;
    list.append(item);
  }
}

function setupDailyLetters() {
  const alphabet = Object.keys(turkishLetterNames);
  const storageKey = 'zabit_daily_letters';
  const openButton = document.getElementById('dailyLettersBtn');
  const dialog = document.getElementById('dailyLettersDialog');
  const practice = document.getElementById('dailyLettersPractice');
  const progress = document.getElementById('dailyLettersProgress');
  const targetDisplay = document.getElementById('dailyLetterTarget');
  const targetHint = document.getElementById('dailyLetterHint');
  const input = document.getElementById('dailyLetterInput');
  const keyboard = document.getElementById('dailyLetterKeyboard');
  const feedback = document.getElementById('dailyLetterFeedback');
  const results = document.getElementById('dailyLettersResults');
  const summary = document.getElementById('dailyLettersSummary');
  const todayErrors = document.getElementById('dailyLetterErrors');
  const frequentErrors = document.getElementById('frequentLetterErrors');
  const resetHistoryButton = document.getElementById('resetLetterHistoryBtn');
  const resetHistoryStatus = document.getElementById('resetLetterHistoryStatus');
  const restartButton = document.getElementById('restartDailyLetters');
  const { byCode, byLetter } = buildTurkishQKeyboard(keyboard);
  let data = { round: null, totals: {} };
  let highlightedKey;
  let highlightTimeout;
  let physicalKey;

  function clearKeyHighlight() {
    clearTimeout(highlightTimeout);
    highlightedKey?.classList.remove('letter-key-pressed');
    highlightedKey = null;
  }

  function highlightKey(key) {
    if (!key) return;
    clearKeyHighlight();
    highlightedKey = key;
    key.classList.add('letter-key-pressed');
    highlightTimeout = setTimeout(clearKeyHighlight, 450);
  }

  function loadPractice() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      const round = saved?.round;
      if (round &&
          Array.isArray(round.letters) && round.letters.length === alphabet.length &&
          alphabet.every(letter => round.letters.includes(letter)) &&
          Number.isInteger(round.position) && round.position >= 0 && round.position <= alphabet.length &&
          validPracticeErrorCounts(round.errors) && validPracticeErrorCounts(saved.totals)) {
        data = saved;
      }
    } catch (e) {}
  }

  function savePractice(nextData = data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextData));
      return true;
    } catch (e) {
      return false;
    }
  }

  function startRound() {
    data.round = { letters: shuffledLetters(alphabet), position: 0, errors: {} };
    savePractice();
  }

  function renderHistory() {
    renderPracticeErrors(frequentErrors, data.totals, 5, 'Geçmişte kayıtlı hata yok.');
    resetHistoryButton.disabled = Object.keys(data.totals).length === 0;
  }

  function renderPractice() {
    const { letters, position, errors } = data.round;
    const finished = position === letters.length;
    practice.hidden = finished;
    results.hidden = !finished;
    feedback.textContent = '';

    if (!finished) {
      progress.textContent = `${position + 1} / ${letters.length} harf`;
      const target = letters[position];
      targetDisplay.textContent = target;
      targetHint.textContent = turkishLetterNames[target];
      return;
    }

    const totalErrors = Object.values(errors).reduce((total, count) => total + count, 0);
    summary.textContent = `Tur tamamlandı. ${letters.length} harf, ${totalErrors} hata.`;
    renderPracticeErrors(todayErrors, errors);
    renderHistory();
    restartButton.focus();
  }

  setupPracticeDialog(openButton, dialog, () => {
    loadPractice();
    if (!data.round) startRound();

    resetHistoryStatus.textContent = '';
    renderPractice();
  });

  restartButton.addEventListener('click', () => {
    loadPractice();
    startRound();
    resetHistoryStatus.textContent = '';
    clearKeyHighlight();
    renderPractice();
    input.focus();
  });

  resetHistoryButton.addEventListener('click', () => {
    if (!window.confirm('Birikmiş hata geçmişi silinecek. Bu turun özeti kalacak. Geçmişi sıfırlamak istiyor musun?')) return;

    loadPractice();
    const cleared = { ...data, totals: {} };
    if (!savePractice(cleared)) {
      resetHistoryStatus.textContent = 'Geçmiş sıfırlanamadı.';
      return;
    }

    data = cleared;
    renderHistory();
    resetHistoryStatus.textContent = 'Hata geçmişi sıfırlandı.';
  });

  window.addEventListener('storage', event => {
    if (dialog.open && event.key === storageKey && event.newValue) {
      loadPractice();
      renderPractice();
    }
  });

  input.addEventListener('paste', event => event.preventDefault());
  input.addEventListener('drop', event => event.preventDefault());
  keyboard.addEventListener('click', () => input.focus());
  input.addEventListener('keydown', event => {
    physicalKey = byCode.get(event.code);
    highlightKey(physicalKey);
    if (event.repeat && event.key.length === 1) event.preventDefault();
  });
  input.addEventListener('keyup', () => { physicalKey = null; });
  dialog.addEventListener('close', () => {
    physicalKey = null;
    clearKeyHighlight();
  });

  input.addEventListener('input', event => {
    if (!dialog.open || event.isComposing) return;
    const pressed = input.value.normalize('NFC').toLocaleLowerCase('tr-TR');
    input.value = '';
    if (!physicalKey) highlightKey(byLetter.get(pressed));
    physicalKey = null;
    if ([...pressed].length !== 1 || !pressed.trim()) return;

    const visibleTarget = data.round.letters[data.round.position];
    loadPractice();

    const round = data.round;
    const target = round.letters[round.position];
    if (!target || target !== visibleTarget) {
      renderPractice();
      return;
    }

    if (pressed !== target) {
      round.errors[target] = (round.errors[target] || 0) + 1;
      savePractice();
      feedback.textContent = `Gelen: ${practiceLetterLabel(pressed)} · Hedef: ${practiceLetterLabel(target)}`;
      return;
    }

    round.position++;
    if (round.position === round.letters.length) {
      for (const [letter, count] of Object.entries(round.errors)) {
        data.totals[letter] = (data.totals[letter] || 0) + count;
      }
    }
    savePractice();
    renderPractice();
  });
}
