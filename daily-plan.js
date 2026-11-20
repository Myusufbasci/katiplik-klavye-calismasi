const sessionsPerCycle = 15;
const sessionsBetweenTrials = 7;
const repetitionsPerMistake = 3;
const firstCycleGoal = 90;
const baselineScore = 70;
const officialPools = OFFICIAL_EXAM_PASSAGES;
const todayFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long'
});
const historyFormatter = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short' });
let planView = 'today';
let sessionPreview = null;

function isSavedSession(session) {
  return session && Number.isInteger(session.number) && session.number > 0 &&
    Number.isInteger(session.openedOn) && Number.isInteger(session.completed) && session.completed >= 0 &&
    (session.finishedOn === null || Number.isInteger(session.finishedOn)) &&
    officialPools[session.track]?.some(passage => passage.id === session.practiceId) &&
    Array.isArray(session.errors) && session.errors.every(word => typeof word === 'string');
}

function frequentWords(words, limit = 8) {
  const counts = new Map();
  for (const word of words.flatMap(value => value.split(/\s+/)).filter(Boolean)) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.keys()].sort((left, right) => counts.get(right) - counts.get(left)).slice(0, limit);
}

function reviewErrorWords(words) {
  return [...new Set(words.flatMap(word => word.normalize('NFC').toLocaleLowerCase('tr-TR').split(/\s+/)).filter(Boolean))];
}

function priorWordCounts(session) {
  const previous = studyData.sessions.findLast(item => item.number < session.number);
  if (!previous) return new Map();
  if (!previous.wordReview) {
    return new Map(reviewErrorWords(previous.errors).map(word => [word, repetitionsPerMistake - 1]));
  }
  return new Map(previous.wordReview.items
    .filter(item => !item.starter && item.count > 1)
    .map(item => [item.word, Math.min(item.count - 1, repetitionsPerMistake)]));
}

function wordReviewItems(session) {
  if (session.wordReview) return session.wordReview.items;
  const counts = priorWordCounts(session);
  for (const word of reviewErrorWords(session.reviewErrors ?? session.errors)) {
    counts.set(word, repetitionsPerMistake);
  }
  if (counts.size) return [...counts].map(([word, count]) => ({ word, count }));
  return reviewErrorWords(passageFor(session).content.split(' ').filter(word => word.length >= 5))
    .slice(0, 4).map(word => ({ word, count: 2, starter: true }));
}

function interleaveReviewWords(items, previousWord) {
  const pending = items.map(item => ({ ...item }));
  const words = [];
  while (pending.length) {
    pending.sort((left, right) => right.count - left.count);
    const different = pending.findIndex(item => item.word !== (words.at(-1) ?? previousWord));
    const index = Math.max(0, different);
    const item = pending[index];
    words.push(item.word);
    item.count--;
    if (!item.count) pending.splice(index, 1);
  }
  return words;
}

function shortenSavedWordReview(review) {
  const oldOrder = review.order ?? interleaveReviewWords(review.items);
  for (const item of review.items) {
    item.count = Math.min(item.count, repetitionsPerMistake);
  }
  const remaining = new Map(review.items.map(({ word, count }) => [word, count]));
  const completed = [];
  for (const word of oldOrder.slice(0, review.completed)) {
    const count = remaining.get(word);
    if (count > 0) {
      completed.push(word);
      remaining.set(word, count - 1);
    }
  }
  const pending = [...remaining].filter(([, count]) => count > 0).map(([word, count]) => ({ word, count }));
  review.completed = completed.length;
  review.order = [...completed, ...interleaveReviewWords(pending, completed.at(-1))];
}

function cycleForSession(number) {
  return Math.ceil(number / sessionsPerCycle);
}

function getCycleHistory() {
  const totals = new Map();
  const peaks = new Map();
  for (const session of studyData.sessions) {
    if (session.finishedOn === null) continue;
    const cycle = cycleForSession(session.number);
    totals.set(cycle, (totals.get(cycle) || 0) + 1);
  }
  for (const result of studyData.results) {
    if (!result.cycle || result.skipped >= 22 || result.errorRate > 0.25) continue;
    peaks.set(result.cycle, Math.max(peaks.get(result.cycle) ?? 0, result.net));
  }
  const latest = studyData.sessions.at(-1);
  const activeCycle = cycleForSession(latest ? latest.number + Number(latest.finishedOn !== null) : 1);
  const history = [];
  let target = firstCycleGoal;
  let lastPeak = baselineScore;
  for (let cycle = 1; cycle <= activeCycle; cycle++) {
    const peak = peaks.get(cycle) ?? null;
    const completed = totals.get(cycle) ?? 0;
    const change = peak === null ? null : peak - lastPeak;
    history.push({ cycle, peak, target, completed, change });
    if (completed === sessionsPerCycle && change !== null) {
      target = peak + Math.max(3, Math.min(15, change));
      lastPeak = peak;
    }
  }
  return history;
}

function choosePracticePassage(track, previous) {
  const pool = officialPools[track];
  const previousIndex = pool.findIndex(passage => passage.id === previous?.practiceId);
  return pool[(previousIndex + 1) % pool.length];
}

function isRotationTrial(rotationStep) {
  return (rotationStep - 1) % sessionsBetweenTrials === 0;
}

function getSession({ advance = false } = {}) {
  const previous = studyData.sessions.at(-1);
  const today = studyDay();
  if (previous && (previous.finishedOn === null || (!advance && previous.finishedOn >= today))) return previous;
  // Oturum açılmadan önce seçilen metni sabit tut.
  if (sessionPreview?.openedOn === today) return sessionPreview;
  const number = (previous?.number || 0) + 1;
  const track = number % 2 === 0 ? 'icra' : 'zabit';
  const rotationStep = (previous?.rotationStep ?? 0) + 1;
  const passage = choosePracticePassage(track, previous);
  sessionPreview = {
    number, track, practiceId: passage.id, trialId: null, openedOn: today, finishedOn: null,
    completed: 0, errors: [], reviewErrors: [], wordReviewAtEnd: true,
    rotationStep, trialDay: isRotationTrial(rotationStep)
  };
  return sessionPreview;
}

function prepareSavedSession(session) {
  if (session.wordReviewAtEnd === undefined) {
    // Kelime turu tamamlandıysa eski adım sırasını koru.
    session.wordReviewAtEnd = session.completed <= (session.number === 1 ? 2 : 1);
  }
  if (session.reviewErrors !== undefined && (!Array.isArray(session.reviewErrors) ||
      !session.reviewErrors.every(word => typeof word === 'string'))) delete session.reviewErrors;
  const review = session.wordReview;
  if (review && (!Array.isArray(review.items) || !review.items.length ||
      !review.items.every(item => item && typeof item.word === 'string' && Number.isSafeInteger(item.count) && item.count > 0) ||
      !Number.isSafeInteger(review.completed) || review.completed < 0)) {
    delete session.wordReview;
  }
  if (session.wordReview && review.order !== undefined && (!Array.isArray(review.order) ||
      review.order.length !== review.items.reduce((total, item) => total + item.count, 0) ||
      !review.order.every(word => typeof word === 'string'))) {
    delete review.order;
  }
  if (session.finishedOn === null && !session.rotationStep && !session.compactFlow) {
    const legacySteps = getSteps(session);
    if (!legacySteps.some(step => step.kind === 'trial')) {
      const removed = legacySteps.slice(0, session.completed).filter(isExtraCopy).length;
      session.completed -= removed;
      session.compactFlow = true;
    }
  }
  if (session.finishedOn === null && getSteps(session)[session.completed]?.kind === 'words' &&
      session.wordReview?.items.some(item => item.count > repetitionsPerMistake)) {
    shortenSavedWordReview(session.wordReview);
  }
  return session;
}

function isExtraCopy(step) {
  return (step.kind === 'copy' && step.label !== 'Isınma') ||
    (step.kind === 'fluent' && step.label !== 'Akıcı yazım');
}

function getSteps(session) {
  const trialDay = session.trialDay ?? [0, 2, 4].includes((session.number - 1) % 5);
  const warmup = { kind: 'copy', label: 'Isınma', seconds: 0, detail: 'Günün metnini sonuna kadar rahat tempoda yaz.' };
  const words = {
    kind: 'words', label: 'Zor kelime alıştırması', seconds: 0,
    detail: 'Kelimeleri acele etmeden yaz. Doğru yazdığında sıradaki kelime gelir.'
  };
  const copy = { kind: 'fluent', label: 'Akıcı yazım', seconds: 0, detail: 'Metni sınav ekranında süresiz yaz.' };
  const trial = { kind: 'trial', label: 'Klavye denemesi', seconds: 180, detail: 'Ayrı bir resmî metinde bugünkü hızını ölç.' };
  const review = { kind: 'review', label: 'Kısa değerlendirme', seconds: 0, detail: 'Bugünkü zor kelimeleri gözden geçir.' };
  if (session.rotationStep) {
    return trialDay ? [
      warmup, copy, { ...trial, detail: 'Aynı metinde 3 dakika yaz ve sonunda hatalarına bak.' }, words
    ] : [warmup, copy, words, review];
  }
  const practice = session.number === 1 ? [trial, copy] : trialDay ? [copy, trial]
    : [copy, { ...copy, label: 'İkinci akıcı yazım' }];
  const sprints = [145, 180, 215].map((offset, index) => ({
    kind: 'copy', label: `Tempo turu ${index + 1}`, seconds: 0, offset,
    detail: index === 0 ? 'Rahat ritmini koru.' : 'Önceki turdan sonra kısa bir ara ver.'
  }));
  const remaining = session.sprint && !trialDay ? [copy, ...sprints] : practice;
  const legacy = session.wordReviewAtEnd !== false ? [warmup, ...remaining, words, review]
    : session.number === 1 ? [warmup, trial, words, copy, review] : [warmup, words, ...remaining, review];
  return session.compactFlow ? legacy.filter(step => !isExtraCopy(step)) : legacy;
}

function completeDailyStep(marker, errors, trialId) {
  const session = studyData.sessions.at(-1);
  if (!marker || !session || session.number !== marker.number ||
      session.completed !== marker.index || session.finishedOn !== null) return false;
  session.completed++;
  session.errors = [...errors, ...session.errors].slice(0, 120);
  if (marker.kind !== 'words') {
    session.reviewErrors = reviewErrorWords([...(session.reviewErrors ?? session.errors), ...errors]);
  }
  if (trialId) session.trialId = trialId;
  if (session.rotationStep && session.completed === getSteps(session).length) session.finishedOn = studyDay();
  return true;
}

function registerReviewError(marker, word, index) {
  const session = studyData.sessions.at(-1);
  const review = session?.wordReview;
  if (!review || session.number !== marker.number || session.completed !== marker.index) return null;
  const errors = reviewErrorWords(session.reviewErrors ?? session.errors);
  const item = review.items.find(entry => entry.word === word);
  if (!item || errors.includes(word)) return null;
  session.reviewErrors = [...errors, word];
  session.errors = [word, ...session.errors].slice(0, 120);

  if (item.count === repetitionsPerMistake && !item.starter) {
    saveStudy();
    return null;
  }
  item.count = repetitionsPerMistake;
  delete item.starter;
  const prefix = review.order.slice(0, index + 1);
  const used = new Map();
  for (const entry of prefix) used.set(entry, (used.get(entry) || 0) + 1);
  const rest = review.items.map(entry => ({ word: entry.word, count: entry.count - (used.get(entry.word) || 0) }))
    .filter(entry => entry.count > 0);
  review.order = [...prefix, ...interleaveReviewWords(rest, word)];
  saveStudy();
  return review.order;
}

function saveWordReviewProgress(marker, completed) {
  const session = studyData.sessions.at(-1);
  if (session?.number !== marker.number || session.completed !== marker.index || !session.wordReview) return;
  session.wordReview.completed = completed;
  saveStudy();
}

function passageFor(session) {
  return officialPools[session.track].find(passage => passage.id === session.practiceId);
}

function activateSession(session) {
  if (session !== sessionPreview) return;
  studyData.started ??= studyDay();
  studyData.sessions.push(session);
  sessionPreview = null;
  saveStudy();
}

function advanceToNextSession() {
  const previous = studyData.sessions.at(-1);
  if (!previous || previous.finishedOn === null) return;
  activateSession(getSession({ advance: true }));
  showPlanView('today');
  studyElement('startDailyStep').focus();
}

function launchDailyStep() {
  const session = getSession();
  if (session.finishedOn !== null) return;
  activateSession(session);
  const step = getSteps(session)[session.completed];
  if (!step) return;
  const marker = { number: session.number, index: session.completed, kind: step.kind };
  if (step.kind === 'review') {
    session.completed++;
    session.finishedOn = studyDay();
    saveStudy();
    showPlanView('today');
    return;
  }
  const passage = passageFor(session);
  if (step.kind === 'fluent') {
    showBenchmarkSetup(session.track, { ...marker, passage });
    return;
  }
  if (step.kind === 'trial') {
    const previous = studyData.sessions.at(-2);
    const text = session.rotationStep ? { passage }
      : { excluded: [session.practiceId, previous?.practiceId, previous?.trialId] };
    showBenchmarkSetup(session.track, { ...marker, ...text });
    return;
  }

  const current = state.drill?.daily;
  showPlanView('drill');
  studyElement('practiceWorkspace').classList.toggle('word-review-practice', step.kind === 'words');
  const description = step.kind === 'words' ? `${step.detail} Liste bitince tur biter.` : step.detail;
  setWorkspaceTitle(step.label, `Oturum ${session.number} · Adım ${session.completed + 1}`, description);
  if (current?.number === marker.number && current.index === marker.index && !state.isFinished) {
    renderExam();
    return;
  }
  rememberPassage(passage.id);
  if (step.kind === 'words') {
    session.wordReview ??= { items: wordReviewItems(session), completed: 0 };
    session.wordReview.order ??= interleaveReviewWords(session.wordReview.items);
    const words = session.wordReview.order;
    const resumeAt = Math.min(session.wordReview.completed, words.length);
    saveStudy();
    startGuidedDrill({
      seconds: 0, label: step.label, content: words.join(' '),
      passageId: passage.id, daily: marker, spaced: true
    }, resumeAt);
    if (resumeAt === words.length) finishExam();
    return;
  }
  const content = step.offset ? passage.content.split(' ').slice(step.offset).join(' ') : passage.content;
  startGuidedDrill({ seconds: step.seconds, label: step.label, content,
    passageId: passage.id, daily: marker });
}

function renderToday(history) {
  const session = getSession();
  const steps = getSteps(session);
  const done = session.finishedOn !== null;
  const activeStep = steps[session.completed];
  const started = studyData.sessions.includes(session);
  const postponed = started && session.openedOn < studyDay() && !done;
  const cycle = history.at(-1);
  studyElement('todayDate').textContent = todayFormatter.format(new Date());
  studyElement('todayHeadline').textContent = done ? 'Bugünkü çalışma tamam' : 'Bugünün çalışması';
  studyElement('todayIntro').textContent = done
    ? 'Hazır olduğunda sıradaki oturuma geçebilirsin.'
    : postponed
      ? 'Kaldığın oturum bugüne taşındı. Aynı metinle sıradaki adımdan devam et.'
      : `Oturum ${session.number} · ${cycleForSession(session.number)}. döngü`;
  const button = studyElement('startDailyStep');
  button.hidden = done;
  studyElement('nextDailySession').hidden = !done;
  button.textContent = session.completed === 0 ? 'Çalışmaya başla' : activeStep?.kind === 'review' ? 'Günü tamamla' : 'Sıradaki adıma başla';
  if (activeStep && activeStep.kind !== 'review') {
    button.setAttribute('aria-label', `${button.textContent} · ${activeStep.label}`);
  } else {
    button.removeAttribute('aria-label');
  }
  const remaining = steps.slice(session.completed);
  const hasTimedTrial = remaining.some(step => step.kind === 'trial');
  studyElement('todayTime').textContent = remaining.every(step => step.kind === 'review') ? ''
    : hasTimedTrial ? 'Sınav 3 dk · Alıştırmalar süresiz' : 'Alıştırmalar süresiz';
  studyElement('todayCount').textContent = `${session.completed} / ${steps.length}`;
  studyElement('todaySteps').replaceChildren(...steps.map((step, index) => {
    const item = document.createElement('li');
    const complete = index < session.completed;
    const current = index === session.completed && !done;
    item.className = complete ? 'step-done' : current ? 'step-current' : '';
    if (current) item.setAttribute('aria-current', 'step');
    const mark = document.createElement('span');
    mark.className = 'step-mark';
    mark.textContent = complete ? '✓' : String(index + 1);
    mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = step.label;
    const detail = document.createElement('p');
    detail.textContent = step.detail;
    if (current && step.kind === 'review') {
      const focus = frequentWords(session.errors, 3);
      if (focus.length) detail.textContent = `Bir kez daha gözden geçir: ${focus.join(', ')}.`;
    }
    const content = document.createElement('div');
    content.append(name, detail);
    const length = document.createElement('span');
    length.className = 'step-length';
    length.textContent = step.kind === 'review' ? '' : step.seconds === 0 ? 'Süresiz' : `${step.seconds / 60} dk`;
    item.append(mark, content, length);
    return item;
  }));

  studyElement('todayPassage').textContent = passageFor(session).title;
  studyElement('todayPassageNote').textContent = 'Adalet Bakanlığı · Temmuz 2026';
  const focus = wordReviewItems(session);
  studyElement('todayFocus').hidden = !focus.length;
  studyElement('todayFocusTitle').textContent = focus[0]?.starter ? 'Günün metninden örnekler' : 'Kelime tekrarları';
  studyElement('todayFocusWords').replaceChildren(...focus.slice(0, 5).map(({ word, count }) => {
    const item = document.createElement('li');
    item.textContent = `${word} ×${count}`;
    return item;
  }));
  studyElement('cycleHeading').textContent = `${cycle.cycle}. döngü`;
  studyElement('cycleSessions').textContent = `${cycle.completed} / ${sessionsPerCycle} oturum`;
  studyElement('cycleBar').value = cycle.completed;
}

function renderProgress(history) {
  const current = history.at(-1);
  studyElement('goalExplanation').textContent = current.cycle === 1
    ? 'Her 15 oturum bir döngü. İlk hedef 90 net. Zirve, bu plandaki 3 dakikalık denemelerden hesaplanır.'
    : 'Yeni hedef, son ölçülen zirveye önceki zirveyle arasındaki artış eklenerek hesaplanır. Artış 3 ile 15 net arasında tutulur.';
  studyElement('cycleHistory').replaceChildren(...history.slice().reverse().map(cycle => {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${cycle.cycle}. döngü`;
    const status = document.createElement('span');
    status.textContent = `${cycle.completed} / ${sessionsPerCycle} oturum`;
    const peak = document.createElement('span');
    const delta = cycle.change > 0 ? `+${cycle.change}` : cycle.change;
    peak.textContent = cycle.peak === null ? 'Zirve —' : `Zirve ${cycle.peak} · Fark ${delta}`;
    const target = document.createElement('span');
    target.className = 'history-target';
    target.textContent = `Hedef ${cycle.target}`;
    row.append(title, status, peak, target);
    return row;
  }));
  const results = latestDistinctTrials();
  const midpoint = results.map(result => result.net).sort((left, right) => left - right)[1];
  const goalDays = new Set(results.filter(result => result.net >= personalGoal &&
    result.accuracy >= accuracyGoal && result.skipped < 22).map(result => studyDay(new Date(result.at)))).size;
  studyElement('studyProgress').textContent = results.length === 3
    ? `Son üç farklı metnin ortancası ${midpoint} net. ${personalGoal}+ net ve %95+ doğruluk görülen gün sayısı ${goalDays}.`
    : results.length ? `${results.length}/3 farklı metinde ölçüm tamamlandı.` : 'İlk denemenden sonra sonuç burada görünecek.';
  studyElement('studyHistory').replaceChildren(...studyData.results.slice(-8).reverse().map(result => {
    const row = document.createElement('li');
    const date = historyFormatter.format(new Date(result.at));
    const text = document.createElement('span');
    text.textContent = `${date} · ${result.title}`;
    const value = document.createElement('strong');
    value.textContent = `${result.net} net · %${studyNumber.format(result.accuracy * 100)}`;
    row.append(text, value);
    return row;
  }));
}

function updatePlanViews() {
  const history = getCycleHistory();
  renderToday(history);
  if (planView === 'progress') renderProgress(history);
}

function setWorkspaceTitle(title, context = '', description = '') {
  studyElement('workspaceHeading').textContent = title;
  studyElement('workspaceContext').textContent = context;
  studyElement('drillLabel').textContent = description;
}

function showPlanView(view, focus = true) {
  if (planView === 'fluent' && view !== 'fluent') leaveFluentWriting();
  if (view !== planView && state.isStarted) pauseExam();
  planView = view;
  const free = view === 'tools';
  studyElement('todayView').hidden = view !== 'today';
  studyElement('progressView').hidden = view !== 'progress';
  studyElement('fluentWorkspace').hidden = view !== 'fluent';
  const workspace = studyElement('practiceWorkspace');
  workspace.hidden = !free && view !== 'drill';
  workspace.classList.toggle('focused-practice', view === 'drill');
  workspace.classList.remove('word-review-practice');
  studyElement('practiceToolbar').hidden = !free;
  studyElement('openBenchmark').hidden = !free;
  studyElement('exitDrill').hidden = view !== 'drill';
  for (const [name, id] of [['today', 'showToday'], ['progress', 'showProgress'], ['tools', 'showTools']]) {
    const button = studyElement(id);
    if (name === view || (name === 'today' && (view === 'drill' || view === 'fluent'))) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (free) {
    setWorkspaceTitle('Serbest çalışma');
    if (state.drill) restoreFreePractice();
    else renderExam();
  }
  updatePlanViews();
  if (focus && view !== 'drill' && view !== 'fluent') {
    studyElement(free ? 'workspaceHeading' : view === 'today' ? 'todayHeadline' : 'progressHeadline').focus();
  }
}

function setupDailyPlan() {
  loadStudy();
  setupBenchmark();
  for (const [id, view] of [['homeBrand', 'today'], ['showToday', 'today'], ['showProgress', 'progress'],
    ['openProgress', 'progress'], ['showTools', 'tools']]) {
    studyElement(id).addEventListener('click', () => showPlanView(view));
  }
  studyElement('exitDrill').addEventListener('click', () => showPlanView(state.drill?.daily ? 'today' : 'tools'));
  studyElement('startDailyStep').addEventListener('click', launchDailyStep);
  studyElement('nextDailySession').addEventListener('click', advanceToNextSession);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && planView === 'today') updatePlanViews();
  });
  let paintedDay = studyDay();
  setInterval(() => {
    const today = studyDay();
    if (today !== paintedDay) {
      paintedDay = today;
      if (planView === 'today') updatePlanViews();
    }
  }, 30_000);
  showPlanView('today', false);
}

document.addEventListener('DOMContentLoaded', setupDailyPlan);
