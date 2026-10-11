#!/usr/bin/env node
/**
 * Builds banner.svg: a terminal window in the ismetozkan.com palette whose
 * lines type themselves out. Text is converted to outlines (JetBrains Mono),
 * because SVGs shown as images on GitHub cannot load web fonts.
 *
 * Usage (from a scratch folder, nothing to install in this repo):
 *   npm i opentype.js@1.3.4
 *   curl -sLO https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
 *   unzip -q JetBrainsMono-2.304.zip 'fonts/ttf/*'
 *   FONTS=./fonts/ttf node /path/to/tools/banner.mjs > /path/to/banner.svg
 *
 * Edit LINES below when the role changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const FONTS = process.env.FONTS || './fonts/ttf';
const font = (name) => opentype.parse(fs.readFileSync(path.join(FONTS, `JetBrainsMono-${name}.ttf`)).buffer);
const F = { regular: font('Regular'), bold: font('Bold'), italic: font('Italic') };

const C = {
	ink: '#0F0E0C', ink2: '#171614', paper: '#EDE8DF', muted: '#A39E94',
	faint: '#6B665E', amber: '#D4A24C', line: 'rgba(237,232,223,0.10)',
};

const W = 900, H = 250, PAD = 40;

/**
 * Each line: segments of [text, font, colour]; size; baseline y; how it appears.
 *   type: characters appear one by one, `ms` apart, with a moving caret.
 *   show: the whole line appears at once (command output).
 */
const LINES = [
	{ y: 84, size: 15, mode: 'type', ms: 85, pause: 500,
		segs: [ [ '$ ', 'regular', C.faint ], [ 'whoami', 'regular', C.paper ] ], prompt: 2 },
	{ y: 134, size: 34, mode: 'type', ms: 55, pause: 250,
		segs: [ [ 'Ismet Ozkan', 'bold', C.paper ] ] },
	{ y: 172, size: 18, mode: 'type', ms: 42, pause: 350,
		segs: [ [ 'Full-Stack Developer & ', 'regular', C.paper ], [ 'AI Specialist', 'italic', C.amber ] ], last: true },
	{ y: 208, size: 13, mode: 'show',
		segs: [ [ '@ District 35 · Utrecht, NL', 'regular', C.muted ] ] },
];

const START = 0.6; // seconds before the first keystroke
const n = (v) => +v.toFixed(2);

/* ---------- glyphs: one <path> per (font, size, char), reused with <use> ---------- */
const glyphs = new Map();
function glyph(fontKey, size, ch, fill) {
	const key = `${fontKey}|${size}|${ch}|${fill}`;
	if (!glyphs.has(key)) {
		const d = F[fontKey].getPath(ch, 0, 0, size).toPathData(2);
		glyphs.set(key, { id: `g${glyphs.size}`, d, fill });
	}
	return glyphs.get(key).id;
}

/* ---------- lines ---------- */
let t = START;
const body = [];
const css = [];
let caretN = 0;

for (const line of LINES) {
	const adv = line.size * 0.6; // JetBrains Mono: 600/1000 em advance
	const chars = line.segs.flatMap(([ text, f, fill ]) => [ ...text ].map((ch) => ({ ch, f, fill })));
	const lineStart = t;

	if (line.mode === 'show') {
		body.push(`<g class="fade" style="animation-delay:${n(t)}s">`);
	}
	chars.forEach(({ ch, f, fill }, i) => {
		const x = n(PAD + i * adv);
		if (ch !== ' ') {
			const id = glyph(f, line.size, ch, fill);
			const delay = line.mode === 'type' && i >= (line.prompt || 0) ? n(t + (i - (line.prompt || 0)) * line.ms / 1000) : n(lineStart);
			body.push(line.mode === 'type'
				? `<use href="#${id}" x="${x}" y="${line.y}" class="k" style="animation-delay:${delay}s"/>`
				: `<use href="#${id}" x="${x}" y="${line.y}"/>`);
		}
	});
	if (line.mode === 'show') {
		body.push('</g>');
		t += 0.4;
		continue;
	}

	// Caret: steps one character at a time while the line types.
	const typed = chars.length - (line.prompt || 0);
	const dur = typed * line.ms / 1000;
	const cx = n(PAD + (line.prompt || 0) * adv);
	const ch = n(line.size * 1.05), cy = n(line.y - line.size * 0.82), cw = n(adv * 0.95);
	const name = `c${caretN++}`;
	const end = t + dur + line.pause / 1000;
	// Slack after the last keyframe: animations can end at progress 0.9999,
	// so nothing important may sit exactly on 100%.
	const total = n(end + (line.last ? 0 : 0.2));
	// Percentages of a timeline that runs from 0 to `total` seconds.
	const p = (s) => n((s / total) * 100);
	if (line.last) {
		// Last line: hidden until its turn, steps along while typing, then blinks forever.
		const frames = [ `0%{opacity:0;transform:translateX(0)}` ];
		for (let i = 0; i <= typed; i++) {
			frames.push(`${p(t + i * line.ms / 1000)}%{opacity:1;transform:translateX(${n(i * adv)}px)}`);
		}
		frames.push(`100%{opacity:1;transform:translateX(${n(typed * adv)}px)}`);
		css.push(`@keyframes ${name}{${frames.join('')}}`);
		// Base style = final state (used when motion is reduced).
		body.push(`<rect class="caret last" x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="${C.amber}" style="transform:translateX(${n(typed * adv)}px);animation:${name} ${total}s step-end both,blink 1.1s step-end ${total}s infinite"/>`);
	} else {
		const frames = [ `0%{opacity:0;transform:translateX(0)}`, `${p(lineStart)}%{opacity:1;transform:translateX(0)}` ];
		for (let i = 1; i <= typed; i++) {
			frames.push(`${p(t + i * line.ms / 1000)}%{opacity:1;transform:translateX(${n(i * adv)}px)}`);
		}
		frames.push(`${p(end)}%,100%{opacity:0;transform:translateX(${n(typed * adv)}px)}`);
		css.push(`@keyframes ${name}{${frames.join('')}}`);
		body.push(`<rect class="caret" x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="${C.amber}" style="opacity:0;animation:${name} ${total}s step-end both"/>`);
	}
	t = end;
}

/* ---------- title bar text: ~/ismetozkan.com (logo style) ---------- */
function text(str, fontKey, size, fill, x, y) {
	const adv = size * 0.6;
	return [ ...str ].map((ch, i) => ch === ' ' ? '' : `<use href="#${glyph(fontKey, size, ch, fill)}" x="${n(x + i * adv)}" y="${y}"/>`).join('');
}
const title = [ [ '~/', 'regular', C.faint ], [ 'ismetozkan', 'bold', C.paper ], [ '.com', 'italic', C.amber ] ];
const tSize = 12, tLen = title.reduce((a, [ s ]) => a + s.length, 0), tAdv = tSize * 0.6;
let tx = n(W / 2 - (tLen * tAdv) / 2);
const titleSvg = title.map(([ s, f, fill ]) => { const out = text(s, f, tSize, fill, tx, 25); tx += s.length * tAdv; return out; }).join('');

/* ---------- amber wave lines (like the site's line art) ---------- */
const waves = [];
for (let i = 0; i < 9; i++) {
	const y0 = 70 + i * 17, amp = 18 + i * 2.2, ph = i * 9;
	waves.push(`<path d="M ${470 + ph} ${y0} C ${600 + ph} ${y0 - amp}, ${690 - ph} ${y0 + amp * 1.6}, ${W + 10} ${y0 - amp * 0.4}"/>`);
}

/* ---------- assemble ---------- */
const defs = [ ...glyphs.values() ].map((g) => `<path id="${g.id}" d="${g.d}" fill="${g.fill}"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Ismet Ozkan — Full-Stack Developer &amp; AI Specialist</title>
<desc id="d">Terminal window: $ whoami — Ismet Ozkan, Full-Stack Developer &amp; AI Specialist, @ District 35 · Utrecht, NL</desc>
<style>
.k{animation:k .06s linear both}
@keyframes k{from{opacity:0}to{opacity:1}}
.fade{animation:fade .6s ease-out both}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes blink{50%{opacity:0}}
${css.join('\n')}
.waves{animation:waves 2.4s cubic-bezier(.22,1,.36,1) .2s both}
@keyframes waves{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.k,.fade,.waves{animation:none}.caret{animation:none!important;opacity:0}.caret.last{opacity:1}}
</style>
<defs>
<radialGradient id="glow" cx="78%" cy="85%" r="60%"><stop offset="0" stop-color="${C.amber}" stop-opacity=".22"/><stop offset=".55" stop-color="${C.amber}" stop-opacity=".05"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
<linearGradient id="wave" x1="470" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.amber}" stop-opacity="0"/><stop offset=".45" stop-color="${C.amber}" stop-opacity=".45"/><stop offset="1" stop-color="${C.paper}" stop-opacity=".12"/></linearGradient>
<clipPath id="win"><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/></clipPath>
${defs}
</defs>
<g clip-path="url(#win)">
<rect width="${W}" height="${H}" fill="${C.ink}"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<g class="waves" fill="none" stroke="url(#wave)" stroke-width="1">${waves.join('')}</g>
<rect width="${W}" height="40" fill="${C.ink2}"/>
<path d="M0 40.5H${W}" stroke="${C.line}"/>
<circle cx="22" cy="20" r="5" fill="${C.amber}"/><circle cx="40" cy="20" r="5" fill="${C.faint}"/><circle cx="58" cy="20" r="5" fill="${C.faint}" opacity=".5"/>
${titleSvg}
${body.join('\n')}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="${C.line}"/>
</svg>
`;

process.stdout.write(svg);
