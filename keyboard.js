function buildTurkishQKeyboard(keyboard, interactive = false) {
  const functionKeyOffsets = [0, 2, 3, 4, 5, 6.5, 7.5, 8.5, 9.5, 11, 12, 13, 14];
  const rows = [
    {
      keys: [...Array(13).fill(1), 2],
      codes: 'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backspace'
    },
    {
      keys: [1.5, ...'qwertyuıopğü'],
      codes: 'Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight'
    },
    {
      keys: [1.75, ...'asdfghjklşi', 1],
      codes: 'CapsLock KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Backslash'
    },
    {
      keys: [1.25, 1, ...'zxcvbnmöç', 1, 2.75],
      codes: 'ShiftLeft IntlBackslash KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight'
    },
    {
      keys: [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
      codes: 'ControlLeft MetaLeft AltLeft Space AltRight Fn ContextMenu ControlRight'
    }
  ];
  const byCode = new Map();
  const byLetter = new Map();

  function addKey(row, offset, width, keyNumber, code, letter) {
    const key = document.createElement(interactive ? 'button' : 'div');
    const isEnter = code === 'Enter';
    const isReference = letter === 'f' || letter === 'j';
    key.className = 'letter-key';
    key.style.gridColumn = `${offset * 4 + 1} / span ${width * 4}`;
    key.style.gridRow = isEnter ? `${row} / span 2` : row;
    if (interactive) {
      key.type = 'button';
      const referenceLabel = isReference ? ', referans çıkıntısı' : '';
      key.setAttribute('aria-label', `${row}. sıra, ${keyNumber}. tuş${referenceLabel}`);
    }
    if (letter) {
      key.dataset.letter = letter;
      byLetter.set(letter, key);
    }
    if (isReference) key.classList.add('letter-key-reference');
    if (isEnter) key.classList.add('letter-key-enter');
    if (row === 1) key.classList.add('letter-key-function');
    byCode.set(code, key);
    keyboard.append(key);
  }

  functionKeyOffsets.forEach((offset, index) => {
    addKey(1, offset, 1, index + 1, index === 0 ? 'Escape' : `F${index}`);
  });
  rows.forEach(({ keys, codes }, rowIndex) => {
    const row = rowIndex + 2;
    const keyCodes = codes.split(' ');
    let offset = 0;
    keys.forEach((key, columnIndex) => {
      const isLetter = typeof key === 'string';
      const width = isLetter ? 1 : key;
      addKey(row, offset, width, columnIndex + 1, keyCodes[columnIndex], isLetter ? key : '');
      offset += width;
    });
    if (rowIndex === 1) addKey(row, offset, 1.5, keys.length + 1, 'Enter');
  });

  return { byCode, byLetter };
}
