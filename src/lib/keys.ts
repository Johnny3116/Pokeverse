// Key / gamepad names in the vocabulary EmulatorJS uses for its control config.

const SPECIAL: Record<string, string> = {
  Backspace: "backspace",
  Tab: "tab",
  Enter: "enter",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "ctrl",
  ControlRight: "ctrl",
  AltLeft: "alt",
  AltRight: "alt",
  Space: "space",
  ArrowLeft: "left arrow",
  ArrowUp: "up arrow",
  ArrowRight: "right arrow",
  ArrowDown: "down arrow",
  PageUp: "page up",
  PageDown: "page down",
  Home: "home",
  End: "end",
  Insert: "insert",
  Delete: "delete",
  Semicolon: "semi-colon",
  Equal: "equal sign",
  Comma: "comma",
  Minus: "dash",
  Period: "period",
  Slash: "forward slash",
  BracketLeft: "open bracket",
  Backslash: "back slash",
  BracketRight: "close braket",
  Quote: "single quote",
};

/** Map a KeyboardEvent.code to an EmulatorJS key name, or null if unsupported. */
export function ejsKeyName(code: string): string | null {
  if (SPECIAL[code]) return SPECIAL[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!.toLowerCase();
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1]!;
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `numpad ${m[1]}`;
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m && Number(m[1]) <= 12) return `f${m[1]}`;
  return null;
}

export const PAD_LABELS: Record<number, string> = {
  0: "BUTTON_1",
  1: "BUTTON_2",
  2: "BUTTON_3",
  3: "BUTTON_4",
  4: "LEFT_TOP_SHOULDER",
  5: "RIGHT_TOP_SHOULDER",
  6: "LEFT_BOTTOM_SHOULDER",
  7: "RIGHT_BOTTOM_SHOULDER",
  8: "SELECT",
  9: "START",
  10: "LEFT_STICK",
  11: "RIGHT_STICK",
  12: "DPAD_UP",
  13: "DPAD_DOWN",
  14: "DPAD_LEFT",
  15: "DPAD_RIGHT",
};

const PRETTY_PAD: Record<string, string> = {
  BUTTON_1: "South (A/✕)",
  BUTTON_2: "East (B/○)",
  BUTTON_3: "West (X/□)",
  BUTTON_4: "North (Y/△)",
  LEFT_TOP_SHOULDER: "LB / L1",
  RIGHT_TOP_SHOULDER: "RB / R1",
  LEFT_BOTTOM_SHOULDER: "LT / L2",
  RIGHT_BOTTOM_SHOULDER: "RT / R2",
  SELECT: "Select / View",
  START: "Start / Menu",
  LEFT_STICK: "L3",
  RIGHT_STICK: "R3",
  DPAD_UP: "D-pad ↑",
  DPAD_DOWN: "D-pad ↓",
  DPAD_LEFT: "D-pad ←",
  DPAD_RIGHT: "D-pad →",
};

export const prettyPad = (name: string) => PRETTY_PAD[name] ?? name;
export const prettyKey = (name: string) =>
  name
    .replace(/ arrow$/, "")
    .replace(/^(.)/, (c) => c.toUpperCase())
    .replace(/^Up$/, "↑")
    .replace(/^Down$/, "↓")
    .replace(/^Left$/, "←")
    .replace(/^Right$/, "→");
