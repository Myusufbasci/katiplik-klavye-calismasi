// Puanlama, yayımlanan değerlendirme örneklerini temel alır.
function scoreExamCopy(source, input) {
  const clean = text => text.normalize('NFC').toLocaleLowerCase('tr-TR');
  const target = clean(source).trim().split(/\s+/);
  const typed = clean(input).trim().split(/\s+/).filter(Boolean);
  const columns = target.length + 1;
  const operations = {
    match: 1, wrong: 2, skip: 3, extra: 4, merge: 5, split: 6, unfinished: 7
  };
  const cost = new Int32Array((typed.length + 1) * columns);
  cost.fill(1_000_000);
  cost[0] = 0;
  const path = new Uint32Array(cost.length);

  function move(index, next, distance, operation, length = 1) {
    const candidate = cost[index] + distance;
    if (candidate < cost[next]) {
      cost[next] = candidate;
      path[next] = length * 8 + operation;
    }
  }

  for (let i = 0; i <= typed.length; i++) {
    const word = typed[i];
    for (let j = 0; j <= target.length; j++) {
      const index = i * columns + j;
      if (word && j < target.length) {
        const next = index + columns + 1;
        if (word === target[j]) {
          move(index, next, -1, operations.match);
        } else if (i === typed.length - 1 && !/\s$/.test(input) && target[j].startsWith(word)) {
          move(index, next, 0, operations.unfinished);
        } else {
          move(index, next, 100, operations.wrong);
        }
        if (j + 1 < target.length) {
          const joinedTarget = target[j] + target[j + 1];
          if (word === joinedTarget || isNearJoinedWord(word, joinedTarget, 2)) {
            move(index, next + 1, 100, operations.merge);
          }
        }
        let joined = word;
        for (let end = i + 1; end < typed.length && joined.length < target[j].length + 1; end++) {
          joined += typed[end];
          const length = end - i + 1;
          if (joined === target[j]) {
            move(index, index + length * columns + 1, 100, operations.split, length);
          } else if (isNearJoinedWord(joined, target[j], 1)) {
            move(index, index + length * columns + 1, length * 100, operations.split, length);
          }
        }
      }
      if (j < target.length) move(index, index + 1, 100, operations.skip);
      if (word) move(index, index + columns, 110, operations.extra);
    }
  }

  // Süreli denemede metnin yazılmayan son bölümü değerlendirme dışıdır.
  const lastRow = typed.length * columns;
  let j = 0;
  for (let end = 1; end <= target.length; end++) {
    if (cost[lastRow + end] < cost[lastRow + j]) j = end;
  }
  const finalCell = lastRow + target.length;
  const finalMerge = j === target.length - 1 && path[finalCell] % 8 === operations.merge &&
    cost[finalCell] === cost[lastRow + j] && typed.at(-1) === target.at(-2) + target.at(-1);
  const reachedEnd = finalMerge || (j === target.length && path[finalCell] % 8 !== operations.unfinished);
  let i = typed.length;
  let correct = 0;
  let skipped = 0;
  let wrong = 0;
  const mistakes = [];

  while (i || j) {
    const entry = path[i * columns + j];
    const operation = entry % 8;
    const length = Math.floor(entry / 8);
    if (operation === operations.match) correct++;
    if (operation === operations.skip) {
      skipped++;
      j--;
      continue;
    }
    if (operation === operations.extra) {
      wrong++;
      mistakes.push({ expected: '', written: typed[--i] });
      continue;
    }
    if (operation === operations.wrong || operation === operations.merge || operation === operations.split) {
      const exactSplit = operation !== operations.split || typed.slice(i - length, i).join('') === target[j - 1];
      wrong += exactSplit ? 1 : length;
      mistakes.push({
        expected: operation === operations.merge ? target.slice(j - 2, j).join(' ') : target[j - 1],
        written: typed.slice(i - length, i).join(' ')
      });
    }
    i -= length;
    j -= operation === operations.merge ? 2 : 1;
  }

  const extraSpaces = (input.match(/\s{2,}/g) || []).length;
  wrong += extraSpaces;
  const assessed = correct + wrong;
  return {
    correct,
    net: Math.max(0, correct - extraSpaces),
    wrong,
    skipped,
    extraSpaces,
    reachedEnd,
    accuracy: assessed ? correct / assessed : 0,
    errorRate: assessed ? wrong / assessed : 0,
    mistakes: mistakes.reverse()
  };
}

function isNearJoinedWord(written, expected, limit) {
  if (expected.length < 5 || Math.abs(written.length - expected.length) > limit ||
      !written.startsWith(expected.slice(0, 2)) || !written.endsWith(expected.slice(-2))) return false;

  let beforePrevious;
  let previous = Array.from({ length: expected.length + 1 }, (_, index) => index);
  for (let i = 1; i <= written.length; i++) {
    const row = [i];
    for (let j = 1; j <= expected.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1,
        previous[j - 1] + Number(written[i - 1] !== expected[j - 1]));
      if (i > 1 && j > 1 && written[i - 1] === expected[j - 2] && written[i - 2] === expected[j - 1]) {
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = row;
  }
  return previous[expected.length] <= limit;
}
