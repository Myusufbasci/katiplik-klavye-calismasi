const studyStorageKey = 'katiplik_study_plan_v1';
const personalGoal = 120;
const accuracyGoal = 0.95;
const trialSeconds = 180;
const millisecondsPerDay = 86_400_000;
const studyNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const officialTrialPools = OFFICIAL_EXAM_PASSAGES;
const warmupWords = 'adalet tutanak dosya mahkeme karar gereğince gizlilik görülür işlem süre şüpheli yönünden sözleşme kayıt tebligat bildirildi hâkim ölçü başvuru sonuç'.split(' ');
const wordDrillCount = 16;

let studyData = { started: null, results: [], difficult: [], seen: [], sessions: [] };
let benchmark = null;
let benchmarkTimerId = null;
let pausedPractice = false;
let plannedBenchmark = null;
const turkeyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

function studyElement(id) {
  return document.getElementById(id);
}

function studyDay(date = new Date()) {
  const parts = turkeyDate.formatToParts(date);
  const number = type => Number(parts.find(part => part.type === type).value);
  return Date.UTC(number('year'), number('month') - 1, number('day')) / millisecondsPerDay;
}

function loadStudy() {
  try {
    const saved = JSON.parse(localStorage.getItem(studyStorageKey));
    if (!saved) return;
    if (Number.isInteger(saved.started)) studyData.started = saved.started;
    if (Array.isArray(saved.results)) {
      studyData.results = saved.results.filter(result => result && typeof result.id === 'string' &&
        typeof result.title === 'string' && typeof result.track === 'string' &&
        Number.isFinite(result.at) && Number.isFinite(result.net) && Number.isFinite(result.accuracy));
    }
    if (Array.isArray(saved.difficult)) studyData.difficult = saved.difficult.filter(word => typeof word === 'string');
    if (Array.isArray(saved.seen)) studyData.seen = saved.seen.filter(id => typeof id === 'string');
    if (Array.isArray(saved.sessions)) studyData.sessions = saved.sessions.filter(isSavedSession).map(prepareSavedSession);
  } catch {}
}

function saveStudy() {
  try {
    localStorage.setItem(studyStorageKey, JSON.stringify(studyData));
  } catch {}
}

function rememberDifficultWords(words) {
  if (!words.length) return;
  const tokens = words.flatMap(word => word.split(/\s+/)).filter(Boolean);
  studyData.difficult = [...tokens, ...studyData.difficult].slice(0, 100);
  saveStudy();
}

function rememberPassage(id) {
  if (!id || studyData.seen.at(-1) === id) return;
  studyData.seen = [...studyData.seen, id].slice(-180);
  saveStudy();
}

function latestDistinctTrials() {
  const start = studyData.started;
  const recent = studyData.results.filter(result => start === null || studyDay(new Date(result.at)) >= start);
  return Array.from(new Map(recent.map(result => [result.id, result])).values())
    .sort((left, right) => right.at - left.at).slice(0, 3);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseDrillWords(frequent, fallback = warmupWords) {
  const words = [...new Set([...frequent, ...fallback, ...warmupWords])].slice(0, wordDrillCount / 2);
  return [...words, ...words.slice(3), ...words.slice(0, 3)].join(' ');
}

function trialPool(track) {
  if (track !== 'custom') return officialTrialPools[track] || [];
  return state.texts.filter(text => text.category === 'Özel Metin')
    .map(text => ({
      id: `custom-${text.id}`,
      title: text.title,
      content: cleanTextForOfficialExam(text.content).split(' ').slice(0, 350).join(' ')
    }))
    .filter(text => text.content.split(' ').length >= 150);
}

function selectTrialPassage(track, excluded = []) {
  const pool = trialPool(track).filter(passage => !excluded.includes(passage.id));
  if (!pool.length) return undefined;
  const used = studyData.seen;
  const byExposure = (left, right) => used.lastIndexOf(left.id) - used.lastIndexOf(right.id);
  const ordered = pool.slice().sort(byExposure);
  const leastRecent = ordered.filter(text => byExposure(text, ordered[0]) === 0);
  return randomItem(leastRecent);
}

function showBenchmarkSetup(track, daily = null) {
  const dialog = studyElement('benchmarkDialog');
  const fluent = daily?.kind === 'fluent';
  benchmark = null;
  plannedBenchmark = daily;
  studyElement('benchmarkSetup').hidden = false;
  studyElement('benchmarkRun').hidden = true;
  studyElement('benchmarkResult').hidden = true;
  studyElement('benchmarkManual').hidden = Boolean(daily);
  studyElement('benchmarkTrack').value = track;
  studyElement('benchmarkTitle').textContent = fluent ? 'Süresiz akıcı yazım' : '3 dakikalık klavye denemesi';
  studyElement('startBenchmark').textContent = daily ? 'Denemeyi başlat' : 'Metni aç';
  if (fluent) {
    revealTrial();
    if (!dialog.open) {
      dialog.showModal();
      studyElement('benchmarkInput').focus();
    }
    return;
  }
  updateBenchmarkSetup();
  if (!dialog.open) {
    pausedPractice = !daily && state.isStarted;
    if (pausedPractice) pauseExam();
    dialog.showModal();
  }
}

function updateBenchmarkSetup() {
  const track = studyElement('benchmarkTrack').value;
  const pool = trialPool(track);
  studyElement('startBenchmark').disabled = !pool.length;
  studyElement('benchmarkSetupStatus').textContent = plannedBenchmark?.passage
    ? plannedBenchmark.passage.title
    : plannedBenchmark
    ? 'Deneme için günün alıştırmasından farklı bir resmî metin açılacak.'
    : track === 'custom'
      ? `${pool.length} uygun metin. Özel metin en az 150 kelime olmalı.`
      : `Temmuz 2026 sınav metinleri · ${pool.length} metin`;
}

function revealTrial() {
  const track = studyElement('benchmarkTrack').value;
  const passage = plannedBenchmark?.passage ?? selectTrialPassage(track, plannedBenchmark?.excluded);
  if (!passage) return;
  const fluent = plannedBenchmark?.kind === 'fluent';
  const words = passage.content.split(' ');
  benchmark = { ...passage, track, daily: plannedBenchmark,
    startedAt: fluent ? null : performance.now(), lastInput: '', typedCount: 0,
    lastTargetWord: words.at(-1) };
  rememberPassage(passage.id);
  studyElement('benchmarkSetup').hidden = true;
  studyElement('benchmarkRun').hidden = false;
  studyElement('benchmarkTextTitle').textContent = passage.title;
  const source = studyElement('benchmarkPassage');
  const fragment = document.createDocumentFragment();
  words.forEach((word, index) => {
    const span = document.createElement('span');
    span.textContent = word;
    if (index) fragment.append(' ');
    fragment.append(span);
  });
  source.replaceChildren(fragment);
  source.scrollTop = 0;
  studyElement('benchmarkTimer').hidden = fluent;
  studyElement('benchmarkTimer').textContent = '3:00';
  const input = studyElement('benchmarkInput');
  input.value = '';
  input.focus();
  if (!fluent) benchmarkTimerId = setInterval(updateBenchmarkClock, 100);
}

function updateBenchmarkClock() {
  if (!benchmark || benchmark.startedAt === null) return;
  const remaining = Math.max(0, Math.ceil(trialSeconds - (performance.now() - benchmark.startedAt) / 1000));
  studyElement('benchmarkTimer').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  if (!remaining) finishBenchmark();
}

function onBenchmarkInput(event) {
  if (!benchmark) return;
  if (benchmark.startedAt !== null && performance.now() - benchmark.startedAt >= trialSeconds * 1000) {
    finishBenchmark();
    return;
  }
  benchmark.lastInput = event.target.value;
  const typedCount = (benchmark.lastInput.trimStart().match(/\s+/g) || []).length;
  if (benchmark.startedAt === null && !event.isComposing) {
    const score = fluentCompletionScore(benchmark);
    if (score) {
      finishBenchmark(score);
      return;
    }
  }
  if (typedCount > benchmark.typedCount) {
    const source = studyElement('benchmarkPassage');
    const upcoming = source.children[typedCount];
    if (upcoming) {
      const offset = upcoming.getBoundingClientRect().top - source.getBoundingClientRect().top;
      if (offset > source.clientHeight * 0.7) source.scrollTop += offset - source.clientHeight * 0.3;
    }
  }
  benchmark.typedCount = typedCount;
}

function fluentCompletionScore(run) {
  const lastWord = run.lastInput.trimEnd().match(/\S+$/)?.[0];
  const matchesLastWord = lastWord?.normalize('NFC').toLocaleLowerCase('tr-TR') === run.lastTargetWord;
  if (!lastWord || (!matchesLastWord && !/\s$/.test(run.lastInput))) return null;

  const score = scoreExamCopy(run.content, run.lastInput);
  return score.reachedEnd ? score : null;
}

function finishBenchmark(completedScore = null) {
  if (!benchmark) return;
  clearInterval(benchmarkTimerId);
  benchmarkTimerId = null;
  const { id, title, track, content, lastInput, daily } = benchmark;
  benchmark = null;
  const score = completedScore ?? scoreExamCopy(content, lastInput);
  const mistakes = score.mistakes.map(mistake => mistake.expected).filter(Boolean);
  if (daily?.kind === 'fluent') {
    if (lastInput.trim()) completeDailyStep(daily, mistakes);
  } else if (lastInput.trim()) {
    const result = { id, title, track, at: Date.now(), net: score.net, accuracy: score.accuracy,
      skipped: score.skipped, errorRate: score.errorRate };
    if (daily && completeDailyStep(daily, mistakes, id)) result.cycle = cycleForSession(daily.number);
    studyData.results.push(result);
  }
  rememberDifficultWords(mistakes);
  saveStudy();
  updatePlanViews();
  renderBenchmarkResult(score, daily);
}

function renderBenchmarkResult(score, daily) {
  const fluent = daily?.kind === 'fluent';
  studyElement('benchmarkRun').hidden = true;
  studyElement('benchmarkResult').hidden = false;
  studyElement('benchmarkResultTitle').textContent = fluent ? 'Akıcı yazım sonucu' : 'Deneme sonucu';
  studyElement('benchmarkResultNote').hidden = fluent;
  const mistakes = score.mistakes.filter(mistake => mistake.expected).slice(0, 8);
  const scores = [
    ['Doğru', score.correct], ['Hatalı', score.wrong],
    ['Atlanan', score.skipped], ['Fazla boşluk', score.extraSpaces],
    ['Doğruluk', `%${studyNumber.format(score.accuracy * 100)}`]
  ];
  if (!fluent) scores.unshift(['Net kelime', score.net]);
  const metrics = studyElement('benchmarkMetrics');
  metrics.replaceChildren(...scores.map(([label, value]) => {
    const pair = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    pair.append(term, description);
    return pair;
  }));
  studyElement('benchmarkStatus').textContent = fluent ? 'Akıcı yazım tamamlandı.' : trialStatus(score);
  studyElement('benchmarkNext').textContent = daily ? 'Bugüne dön' : 'Yeni metin seç';
  studyElement('benchmarkPractice').hidden = Boolean(daily);
  studyElement('benchmarkMistakes').hidden = !mistakes.length;
  studyElement('benchmarkMistakeList').replaceChildren(...mistakes.map(({ written, expected }) => {
    const item = document.createElement('li');
    item.textContent = `${written} → ${expected}`;
    return item;
  }));
  studyElement('benchmarkResultTitle').focus();
}

function trialStatus(score) {
  const issues = [];
  if (score.net < 90) issues.push('net 90 kelimenin altında');
  if (score.errorRate > 0.25) issues.push('hata oranı %25’in üzerinde');
  if (score.skipped >= 22) issues.push('22 veya daha fazla atlanan kelime');
  const verdict = issues.length ? `2026 deneme eşiği: ${issues.join(', ')}.` : '2026 deneme eşiği karşılandı.';
  const target = getCycleHistory().at(-1).target;
  const goal = score.net >= target ? `Döngünün ${target} net hedefini karşıladın.` : `Döngü hedefine ${target - score.net} net kaldı.`;
  return `${verdict} ${goal}`;
}

function setupBenchmark() {
  const dialog = studyElement('benchmarkDialog');
  studyElement('openBenchmark').addEventListener('click', () => showBenchmarkSetup('zabit'));
  studyElement('startBenchmark').addEventListener('click', revealTrial);
  studyElement('benchmarkTrack').addEventListener('change', updateBenchmarkSetup);
  studyElement('benchmarkNext').addEventListener('click', () => {
    if (plannedBenchmark) {
      dialog.close();
      showPlanView('today');
      return;
    }
    showBenchmarkSetup(studyElement('benchmarkTrack').value);
    studyElement('benchmarkTrack').focus();
  });
  studyElement('benchmarkPractice').addEventListener('click', () => {
    pausedPractice = false;
    dialog.close();
    showPlanView('drill');
    setWorkspaceTitle('Zor kelime alıştırması', 'Serbest çalışma', 'Kelimeleri rahat tempoda yaz. Liste bitince tur biter.');
    startGuidedDrill({ seconds: 0, label: 'Zor kelime alıştırması', content: chooseDrillWords(frequentWords(studyData.difficult)) });
  });
  const input = studyElement('benchmarkInput');
  input.addEventListener('input', onBenchmarkInput);
  for (const event of ['paste', 'drop']) input.addEventListener(event, e => e.preventDefault());
  dialog.addEventListener('close', () => {
    clearInterval(benchmarkTimerId);
    benchmarkTimerId = null;
    benchmark = null;
    plannedBenchmark = null;
    if (pausedPractice && !studyElement('practiceWorkspace').hidden) {
      startExam();
      elements.wordInput.focus();
    }
    pausedPractice = false;
  });
}
