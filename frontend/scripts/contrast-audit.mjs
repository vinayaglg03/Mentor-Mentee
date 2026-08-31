// Contrast audit for the design tokens.
//
//   node scripts/contrast-audit.mjs
//
// Reads the token values straight out of src/index.css - light from :root,
// dark from :root[data-theme='dark'] - resolves the var() chains, and checks
// every text/background pair the app actually renders, in both themes.
//
// WCAG 2.1: body text needs 4.5:1, large text (>=24px, or >=18.66px bold) and
// non-text UI such as icons, borders and focus rings need 3:1.
//
// Exits non-zero if anything fails, so it can go in CI.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8');

// --- Parsing -----------------------------------------------------------------

const blockAfter = (selector) => {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in index.css`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${selector} block`);
};

const declarations = (block) => {
  const out = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
};

const light = declarations(blockAfter(':root {'));
const dark = { ...light, ...declarations(blockAfter(":root[data-theme='dark']")) };

// --- Colour ------------------------------------------------------------------

const resolve = (value, tokens, seen = new Set()) => {
  let out = String(value).trim();

  for (let i = 0; i < 10; i++) {
    const match = out.match(/var\((--[\w-]+)\)/);
    if (!match) break;
    const name = match[1];
    if (seen.has(name)) throw new Error(`circular token: ${name}`);
    seen.add(name);
    if (!(name in tokens)) throw new Error(`undefined token: ${name}`);
    out = out.replace(match[0], tokens[name]).trim();
  }

  return out;
};

const parse = (value) => {
  const text = value.trim();

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }

  const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[,/]/).map(p => parseFloat(p.trim()));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }

  throw new Error(`cannot parse colour: ${value}`);
};

// A translucent foreground or tint is really the blend of it over what is
// behind it, which is what the eye judges.
const over = (top, bottom) => {
  const [r1, g1, b1, a] = top;
  const [r2, g2, b2] = bottom;
  return [
    r1 * a + r2 * (1 - a),
    g1 * a + g2 * (1 - a),
    b1 * a + b2 * (1 - a),
    1,
  ];
};

const luminance = ([r, g, b]) => {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const ratio = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

// --- What the app actually puts on top of what -------------------------------

// [foreground, background(s) from furthest back to nearest, minimum, description]
const PAIRS = [
  ['--text-primary', ['--surface'], 4.5, 'body text on the page'],
  ['--text-primary', ['--surface-raised'], 4.5, 'body text on a card'],
  ['--text-primary', ['--surface-sunken'], 4.5, 'body text on a well'],
  ['--text-secondary', ['--surface'], 4.5, 'secondary text on the page'],
  ['--text-secondary', ['--surface-raised'], 4.5, 'secondary text on a card'],
  ['--text-secondary', ['--surface-sunken'], 4.5, 'table heading on its bar'],
  ['--text-muted', ['--surface-raised'], 4.5, 'placeholder text in an input'],
  ['--text-muted', ['--surface'], 4.5, 'muted text on the page'],

  ['--accent-fg', ['--accent-solid'], 4.5, 'label on a primary button'],
  ['--accent-fg', ['--accent-solid-hover'], 4.5, 'label on a hovered primary button'],
  ['--accent-text', ['--surface-raised'], 4.5, 'link and outline-button label on a card'],
  ['--accent-text', ['--surface'], 4.5, 'link on the page'],
  ['--accent', ['--surface'], 3, 'focus ring and active indicator'],
  ['--accent', ['--surface-raised'], 3, 'focused input border'],
  ['--border-strong', ['--surface-raised'], 3, 'outline-button border'],

  ['--danger-fg', ['--surface-raised', '--danger-soft'], 4.5, 'danger badge'],
  ['--warning-fg', ['--surface-raised', '--warning-soft'], 4.5, 'warning badge'],
  ['--success-fg', ['--surface-raised', '--success-soft'], 4.5, 'success badge'],
  ['--info-fg', ['--surface-raised', '--info-soft'], 4.5, 'info badge'],
  ['--warning-fg', ['--surface', '--warning-soft'], 4.5, 'scope warning banner'],

  ['--danger', ['--surface-raised'], 3, 'alert bar and icon'],
  ['--warning', ['--surface-raised'], 3, 'attendance warning icon'],
  ['--success', ['--surface-raised'], 3, 'pass indicator'],
  ['--info', ['--surface-raised'], 3, 'informational icon'],

  ['--chrome-fg', ['--chrome-bg'], 4.5, 'sidebar label'],
  ['--chrome-fg-muted', ['--chrome-bg'], 4.5, 'inactive sidebar item'],
  ['--chrome-fg', ['--chrome-bg-raised'], 4.5, 'student header text'],
  ['--chrome-danger', ['--chrome-bg'], 4.5, 'sign out'],
];

// --- Run ---------------------------------------------------------------------

let failures = 0;
const rows = [];

for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
  for (const [fgToken, bgTokens, minimum, description] of PAIRS) {
    let bg;
    try {
      for (const token of bgTokens) {
        const colour = parse(resolve(`var(${token})`, tokens));
        bg = bg ? over(colour, bg) : colour;
      }

      const fgRaw = parse(resolve(`var(${fgToken})`, tokens));
      const fg = fgRaw[3] < 1 ? over(fgRaw, bg) : fgRaw;

      const value = ratio(fg, bg);
      const pass = value >= minimum;
      if (!pass) failures++;

      rows.push({
        theme,
        description,
        pair: `${fgToken} on ${bgTokens.join(' + ')}`,
        value: value.toFixed(2),
        minimum: minimum.toFixed(1),
        pass,
      });
    } catch (error) {
      failures++;
      rows.push({
        theme, description, pair: `${fgToken} on ${bgTokens.join(' + ')}`,
        value: 'ERROR', minimum: String(minimum), pass: false, error: error.message,
      });
    }
  }
}

const width = Math.max(...rows.map(r => r.description.length));

for (const theme of ['light', 'dark']) {
  console.log(`\n  ${theme.toUpperCase()}`);
  for (const row of rows.filter(r => r.theme === theme)) {
    const mark = row.pass ? 'pass' : 'FAIL';
    console.log(
      `  ${mark}  ${row.description.padEnd(width)}  ${String(row.value).padStart(6)}:1`
      + ` (needs ${row.minimum})${row.error ? '  ' + row.error : ''}`
    );
  }
}

console.log(
  `\n  ${rows.length - failures}/${rows.length} pairs pass in both themes.`
  + (failures ? `  ${failures} FAILING.\n` : '\n')
);

process.exit(failures ? 1 : 0);
