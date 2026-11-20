const legacyPracticeTexts = typeof LEGACY_PRACTICE_TEXTS === 'undefined' ? [] : LEGACY_PRACTICE_TEXTS;

const OFFICIAL_TRACK_NAMES = { zabit: 'Zabıt', icra: 'İcra' };

function makeExamPassages() {
  return Object.fromEntries(Object.entries(OFFICIAL_JULY_2026_ORDER).map(([track, ids]) => [
    track,
    ids.map((id, index) => ({
      id,
      textId: `${track}-2026-${index + 1}`,
      title: `${OFFICIAL_TRACK_NAMES[track]} · Metin ${index + 1}`,
      category: `${OFFICIAL_TRACK_NAMES[track]} · 2026`,
      content: OFFICIAL_JULY_2026_PASSAGES[id]
    }))
  ]));
}

const OFFICIAL_EXAM_PASSAGES = makeExamPassages();
const OFFICIAL_PRACTICE_TEXTS = Object.values(OFFICIAL_EXAM_PASSAGES).flat()
  .map(({ id, textId, ...passage }) => ({ ...passage, id: textId, passageId: id }));

function cleanTextForOfficialExam(rawText) {
  return rawText
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase('tr-TR');
}
