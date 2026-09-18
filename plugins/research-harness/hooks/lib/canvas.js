'use strict';

const MARKERS = ['proposed', 'tentative', 'stated', 'accepted'];
const COMMITTED = new Set(['stated', 'accepted']);
const EMPTY_PLACEHOLDER = '_(empty)_';

const ELEMENT_RE = /^# ([1-9]) · (.+)$/;
const QUESTION_RE = /^## ([1-9]\.\d+) (.+)$/;
const MARKER_GROUP_RE = /\s*\[([^[\]]+)\]\s*$/;

function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { data: {}, end: 0 };
  const data = {};
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return { data, end: i + 1 };
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (m) data[m[1]] = m[2].trim();
  }
  return { data, end: lines.length, unterminated: true };
}

// "Some text. [marker, tag, tag]" → { text, marker, tags } or null when the
// trailing bracket group is missing or its first token is not a known marker.
function parseMarkerGroup(paragraph) {
  const m = MARKER_GROUP_RE.exec(paragraph);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => p.trim()).filter(Boolean);
  if (!MARKERS.includes(parts[0])) return null;
  return { text: paragraph.slice(0, m.index).trim(), marker: parts[0], tags: parts.slice(1) };
}

function parseCanvas(text) {
  const lines = String(text).split('\n');
  const fm = parseFrontmatter(lines);
  const result = { frontmatter: fm.data, elements: [], problems: [] };
  if (fm.unterminated) result.problems.push('frontmatter is not terminated');

  let element = null;
  let question = null;
  let paragraph = [];
  let paragraphStart = -1;

  const flush = () => {
    if (!paragraph.length) return;
    const raw = paragraph.join('\n');
    const line = paragraphStart + 1;
    paragraph = [];
    paragraphStart = -1;
    if (raw.trim() === EMPTY_PLACEHOLDER) return;
    if (!question) {
      result.problems.push(`line ${line}: text outside any question`);
      return;
    }
    const group = parseMarkerGroup(raw);
    if (!group) {
      question.statements.push({ text: normalizeText(raw), marker: null, tags: [], raw, line });
      return;
    }
    question.statements.push({ text: normalizeText(group.text), marker: group.marker, tags: group.tags, raw, line });
  };

  for (let i = fm.end; i < lines.length; i += 1) {
    const l = lines[i];
    const el = ELEMENT_RE.exec(l);
    if (el) {
      flush();
      element = { number: Number(el[1]), title: el[2].trim(), questions: [], line: i + 1 };
      result.elements.push(element);
      question = null;
      continue;
    }
    const q = QUESTION_RE.exec(l);
    if (q) {
      flush();
      if (!element) {
        result.problems.push(`line ${i + 1}: question outside any element`);
        continue;
      }
      question = { id: q[1], text: q[2].trim(), statements: [], line: i + 1 };
      element.questions.push(question);
      continue;
    }
    if (l.trim() === '') {
      flush();
      continue;
    }
    if (!paragraph.length) paragraphStart = i;
    paragraph.push(l);
    // A statement closes where its marker group closes. The canvas of §4.2
    // writes consecutive statements on consecutive lines, so a blank line is
    // not the only boundary. A statement may still run over several lines: it
    // ends at the line that carries the marker. Text with no marker group, or
    // with an unknown one, keeps accumulating to the next blank line.
    if (parseMarkerGroup(paragraph.join('\n'))) flush();
  }
  flush();
  return result;
}

// Status comes from committed statements only (§4.4). Proposals sit alongside
// and never lower it; they are counted in `open`.
function elementStatus(element) {
  const all = element.questions.flatMap((q) => q.statements);
  const committed = all.filter((s) => COMMITTED.has(s.marker));
  const open = all.length - committed.length;
  if (!all.length) return { status: 'empty', open: 0 };
  if (!committed.length) return { status: 'open', open };
  const status = committed.every((s) => s.marker === 'accepted') ? 'accepted' : 'stated';
  return { status, open };
}

function allStatements(parsed) {
  const out = [];
  for (const el of parsed.elements) {
    for (const q of el.questions) {
      for (const s of q.statements) out.push({ element: el.number, question: q.id, ...s });
    }
  }
  return out;
}

module.exports = {
  MARKERS,
  COMMITTED,
  EMPTY_PLACEHOLDER,
  normalizeText,
  parseMarkerGroup,
  parseCanvas,
  elementStatus,
  allStatements,
};
