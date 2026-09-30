'use strict';

const fs = require('node:fs');
const path = require('node:path');

const canvas = require('./canvas');
const project = require('./project');
const seal = require('./seal');
const { textHash } = require('./hash');
const { loadState, ledgerRefusal } = require('./state');
const { headingRefusal, labelRefusal, today, refuse } = require('./log');

// The frontmatter block and the body below it, split where parseCanvas splits
// them: a first line of `---` up to the next `---`. A text without that block
// is all body.
function splitFrontmatter(text) {
  const lines = String(text).split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) return { head: [], body: lines };
  return { head: lines.slice(0, end + 1), body: lines.slice(end + 1) };
}

function lensOf(parsed) {
  const lens = parsed.frontmatter.lens;
  return typeof lens === 'string' && lens.trim() ? lens.trim() : null;
}

// Choosing a framing is the researcher's act, like an acceptance: the model
// generates the variants and never picks one. The chosen variant's statements
// become research/canvas.md as they are — proposed, tentative or stated — under
// the main canvas's own frontmatter, and a sealed DECISION in the MAIN log
// records the choice, the reason, what was rejected, and the text hash of the
// variant canvas that was copied. The variants stay where they are as the
// record of what was compared. The CLI and the session view both come through
// here.
function chooseFraming({ root, name, why, rejected, pluginRoot } = {}) {
  if (!project.isVariantName(name)) return refuse('invalid', 'choose needs a variant name: lowercase letters, digits and hyphens.', true);
  const reason = typeof why === 'string' ? why.trim() : '';
  if (!reason) return refuse('invalid', 'choose needs --why <text>: the reason for this framing is part of the record.', true);
  if (rejected !== undefined && typeof rejected !== 'string') return refuse('invalid', '--rejected takes a text.');

  const main = loadState(root, { pluginRoot });
  if (main.error) return refuse(main.code, main.error);
  const variant = loadState(root, { pluginRoot, variant: name });
  if (variant.error) return refuse(variant.code, variant.error);

  // An acceptance is bound to a statement of the framing it was made in.
  // Replacing that framing would leave the acceptance's entry stale and the
  // commitment gone, so a framing is chosen before anything is accepted.
  const accepted = canvas.allStatements(main.parsed).filter((s) => s.marker === 'accepted');
  if (accepted.length) {
    return refuse('already', `The main canvas already holds ${accepted.length} [accepted] statement${accepted.length === 1 ? '' : 's'} (${[...new Set(accepted.map((s) => s.question))].join(', ')}); a framing is chosen before anything is accepted, so nothing is changed.`);
  }
  // A variant is written by the model, and only an acceptance may put
  // [accepted] into the main canvas. Copying one would plant a commitment no
  // entry accounts for.
  const plantedAccept = canvas.allStatements(variant.parsed).filter((s) => s.marker === 'accepted');
  if (plantedAccept.length) {
    return refuse('invalid', `Variant ${name} holds [accepted] statements (${[...new Set(plantedAccept.map((s) => s.question))].join(', ')}), which only an acceptance on the main canvas can write; nothing is changed.`);
  }

  const lens = lensOf(variant.parsed);
  let rejectedText = typeof rejected === 'string' && rejected.trim() ? rejected.trim() : undefined;
  if (rejectedText === undefined) {
    const others = project.variantNames(root).filter((n) => n !== name).map((n) => {
      const text = project.readIfExists(project.canvasPath(root, n));
      const otherLens = text === null ? null : lensOf(canvas.parseCanvas(text));
      return otherLens ? `${n} (lens: ${otherLens})` : n;
    });
    if (others.length) rejectedText = others.join('; ');
  }
  const body = `Framing ${name}${lens ? ` (lens: ${lens})` : ''} chosen; its statements are copied into the main canvas.`;
  const heading = headingRefusal(reason, rejectedText, body) || labelRefusal(reason, rejectedText, body);
  if (heading) return refuse('invalid', heading);

  const refusal = ledgerRefusal(main);
  if (refusal) return refuse(refusal.code, `Cannot choose ${name}: ${refusal.error}`);

  const { head } = splitFrontmatter(main.canvasText);
  const { body: variantBody } = splitFrontmatter(variant.canvasText);
  fs.writeFileSync(main.paths.canvas, [...head, ...variantBody].join('\n'));

  const hash = textHash(variant.canvasText);
  const logged = seal.sealedAppend(main.paths.decisions, {
    date: today(),
    kind: 'DECISION',
    ref: `framing chosen: ${name}`,
    hash,
    body,
    why: reason,
    rejected: rejectedText,
  }, main.key, { decision: true });
  return {
    ok: true,
    seq: logged.seq,
    seal: logged.seal,
    hash,
    name,
    lens,
    rejected: rejectedText || null,
    statements: canvas.allStatements(variant.parsed).filter((s) => s.marker !== null).length,
    canvas: path.relative(root, main.paths.canvas),
  };
}

module.exports = { chooseFraming };
