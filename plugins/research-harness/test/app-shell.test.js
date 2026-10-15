'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The isolation of test/app-api.test.js: no global git identity, the sealing
// key and the name under a temporary state directory, file:// links allowed so
// a bare remote on disk can be cloned.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.RESEARCH_HARNESS_DIR;
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-shell-state-'));
process.env.RESEARCH_HARNESS_STATE_DIR = stateDir;
process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';

const { start } = require('../bin/canvas-serve');
const appGit = require('../hooks/lib/app-git');
const { runCli } = require('../hooks/lib/app-cli');
const { routes } = require('../hooks/lib/app-api');
const { chromium, launchChromium, focusContrastRatios, documentWidths } = require('./helpers/a11y');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'app.html'), 'utf8');
const skip = !chromium;

const roots = [stateDir];
function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-shell-'));
  roots.push(dir);
  return dir;
}
test.after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function sh(cwd, ...args) {
  return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });
}

const context = (dataDir, root = null) => {
  let current = root;
  return { dataDir, getRoot: () => current, setRoot: (r) => { current = r; } };
};

async function makeProject(folder = 'voice-uptake', title = 'Voice uptake') {
  const created = await routes.init({ parent: tmp(), folder, mode: 'brainstorming', title }, context(tmp()));
  assert.equal(created.ok, true, created.error);
  return created.current;
}

// A creates the project and pushes it to a bare remote; B clones it and joins
// with A's key (the setup of test/app-api.test.js).
async function twoPeopleSharingOneProject() {
  const a = await makeProject('shared', 'Shared');
  assert.equal((await runCli(a, ['name', 'A. Author'])).ok, true);
  assert.equal((await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'Shared finding'])).ok, true);
  sh(a, 'init', '-b', 'main');
  sh(a, 'add', '.');
  sh(a, '-c', 'user.name=A. Author', '-c', 'user.email=a@example.invalid', 'commit', '-m', 'Start the project');
  const remote = path.join(tmp(), 'remote.git');
  sh(path.dirname(remote), 'init', '--bare', '-b', 'main', 'remote.git');
  sh(a, 'remote', 'add', 'origin', remote);
  sh(a, 'push', '-u', 'origin', 'main');
  const keyFile = path.join(tmp(), 'a.seal.key');
  assert.equal((await runCli(a, ['key', 'export', '--out', keyFile])).ok, true);
  const cloned = await appGit.clone({ url: `file://${remote}`, parent: tmp(), folder: 'shared' });
  assert.equal(cloned.ok, true, cloned.error);
  const b = cloned.root;
  assert.equal((await runCli(b, ['join', '--key-file', keyFile, '--name', 'B. Supervisor'])).ok, true);
  return { a, b, keyFile };
}

async function startApp(t, { open = null } = {}) {
  const srv = await start({ root: null, app: { dataDir: tmp() } });
  t.after(() => srv.close());
  if (open) {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/app/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Harness-Token': srv.token },
      body: JSON.stringify({ root: open }),
    });
    assert.equal((await res.json()).ok, true);
  }
  return srv;
}

async function openPage(t, srv, { viewport = { width: 1440, height: 900 }, colorScheme = 'light', host = false } = {}) {
  const browser = await launchChromium();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport, colorScheme });
  page.on('pageerror', (err) => t.diagnostic(`pageerror: ${err.message}`));
  if (host) {
    await page.addInitScript(() => {
      window.harnessHost = {
        pickFolder: async () => window.__picked || null,
        pickFile: async () => window.__picked || null,
        saveFile: async () => window.__picked || null,
        reveal: async () => {},
        openExternal: async () => {},
      };
    });
  }
  await page.goto(srv.appUrl);
  return page;
}

const sessionView = (page) => page.frameLocator('iframe[title="Session view"]');
const START_BUTTONS = ['New project…', 'Open project…', 'Clone from link…'];

// -- The page's source ------------------------------------------------------

test('app.html is self-contained and keeps the token out of every store', () => {
  const offenders = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter((url) => !url.startsWith('http://www.w3.org/2000/svg'));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /event\.origin !== location\.origin \|\| event\.source !== frame\.contentWindow/);
  assert.doesNotMatch(html, /role="status"/, 'outcomes are aria-live lines that stay, not status toasts');
  assert.doesNotMatch(html, /setTimeout/, 'nothing disappears on a timer');
});

// -- Rendered ------------------------------------------------------------------

test('first start: three ways in, each with one sentence, all reachable by Tab', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('heading', { name: 'Start with a paper project' }).waitFor();
  assert.equal(await page.locator('#sidebar').isVisible(), false, 'no project, no sidebar');
  assert.doesNotMatch(page.url(), /#|c=/, 'the code leaves the address bar');
  for (const name of START_BUTTONS) {
    const sentence = await page.getByRole('button', { name }).evaluate((b) => document.getElementById(b.getAttribute('aria-describedby')).textContent.trim());
    assert.match(sentence, /^[A-Z][^.]{20,}\.$/, `${name} is explained by one sentence`);
  }
  const reached = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    reached.push(await page.evaluate(() => document.activeElement.textContent.trim()));
  }
  assert.deepEqual(reached.filter((name) => START_BUTTONS.includes(name)), START_BUTTONS, 'Tab reaches the three buttons in order');
});

test('an open project: sidebar with name, folder, Meeting and People, and the session view gets the token', { skip, timeout: 120000 }, async (t) => {
  const root = await makeProject();
  const srv = await startApp(t, { open: root });
  const page = await openPage(t, srv);
  await page.locator('#proj-name').waitFor();
  assert.equal((await page.locator('#proj-name').textContent()).trim(), 'Voice uptake');
  assert.equal((await page.locator('#proj-path').textContent()).trim(), root);
  for (const name of ['Project', 'Meeting', 'People']) {
    assert.equal(await page.getByRole('heading', { level: 2, name, exact: true }).count(), 1, `${name} section`);
  }
  for (const name of ['Get updates', 'Send my changes…', 'Open project…', 'Clone from link…', 'New project…', 'Start session…', 'Agenda', 'Export minutes…', 'Invite co-author…']) {
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${name}`) }).count(), 1, name);
  }
  assert.equal(await page.locator('#btn-join').isVisible(), false, 'this machine holds the key: no Join');
  const view = sessionView(page);
  await view.locator('#poster.active').waitFor();
  assert.equal(await view.locator('#notice').evaluate((n) => n.hidden), true, 'the view took the token from the shell and never tried a code of its own');

  // After redemption neither the page nor the address holds the token or the code.
  const content = await page.content();
  assert.ok(!content.includes(srv.token), 'the page source does not include the token');
  assert.ok(!content.includes(srv.code), 'the page source does not include the code');
  const href = await page.evaluate(() => location.href);
  assert.ok(!href.includes(srv.token) && !href.includes(srv.code), 'the address holds neither');
  assert.equal(await page.evaluate(() => JSON.stringify([localStorage.length, sessionStorage.length])), '[0,0]');
});

test('Get updates with a conflict outside decisions.md: the message sits next to the button, names the file, and focus stays', { skip, timeout: 120000 }, async (t) => {
  const { a, b } = await twoPeopleSharingOneProject();
  fs.appendFileSync(path.join(a, 'research', 'canvas.md'), '\nA edit\n');
  fs.appendFileSync(path.join(b, 'research', 'canvas.md'), '\nB edit\n');
  assert.equal((await routes.send({}, context(tmp(), a))).ok, true);
  const srv = await startApp(t, { open: b });
  const page = await openPage(t, srv);
  const button = page.getByRole('button', { name: /^Get updates/ });
  await button.focus();
  await page.keyboard.press('Enter');
  const outcome = page.locator('#out-update');
  await page.waitForFunction(() => /canvas\.md/.test(document.getElementById('out-update').textContent));
  assert.match(await outcome.textContent(), /research\/canvas\.md/, 'the message names the file');
  assert.match(await outcome.textContent(), /Nothing was changed/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-update', 'focus stays on the button');
  assert.equal(await outcome.getAttribute('aria-live'), 'polite');
  const box = await Promise.all([button.boundingBox(), outcome.boundingBox()]);
  assert.ok(box[1].y > box[0].y && box[1].y - (box[0].y + box[0].height) < 120, 'the message is next to the button');
  assert.equal(await page.locator('[role="status"]').count(), 0);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.match(await outcome.textContent(), /research\/canvas\.md/, 'the message does not go away on its own');
  assert.equal(fs.existsSync(path.join(b, '.git', 'MERGE_HEAD')), false);
});

test('Get updates counts the new entries and Send reports what it did', { skip, timeout: 120000 }, async (t) => {
  const { a, b } = await twoPeopleSharingOneProject();
  assert.equal((await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'From A'])).ok, true);
  assert.equal((await routes.send({}, context(tmp(), a))).ok, true);
  assert.equal((await runCli(b, ['log', 'DISCOVERY', '1.1', '--body', 'From B'])).ok, true);
  const srv = await startApp(t, { open: b });
  const page = await openPage(t, srv);
  await page.locator('#proj-name').waitFor();
  assert.deepEqual(await page.locator('#people li').allTextContents(), ['A. Author', 'B. Supervisor']);
  await page.getByRole('button', { name: /^Get updates/ }).click();
  await page.waitForFunction(() => /new entr/.test(document.getElementById('out-update').textContent));
  assert.match(await page.locator('#out-update').textContent(), /1 new entry in the decision log from [A-Z]\. [A-Za-z]+\. The two decision logs were merged\./);
  assert.equal((await page.locator('#update-badge').textContent()).trim(), '1 new');
  await page.getByRole('button', { name: 'Send my changes…' }).click();
  assert.match(await page.locator('#dlg').textContent(), /Uploads them to the shared copy/, 'the dialog says where the changes go');
  await page.locator('#dlg').getByRole('button', { name: 'Send changes' }).click();
  await page.waitForFunction(() => document.getElementById('out-send').textContent || document.getElementById('dlg-error')?.textContent);
  assert.match(await page.locator('#out-send').textContent(), /Sent\. The shared copy now holds all your changes\./, await page.locator('#dlg-error').textContent().catch(() => ''));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-send', 'focus returns to the control that opened the dialog');
});

test('in a plain browser, Open project… shows a labelled path field and no picker', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('button', { name: 'Open project…' }).click();
  const field = page.getByLabel('Project folder');
  assert.equal(await field.isVisible(), true);
  assert.equal(await page.locator('#dlg button[data-pick]').count(), 1, 'the template carries one Choose… button');
  assert.equal(await page.locator('#dlg button[data-pick]').isVisible(), false, 'and it is not shown without a host bridge');
  assert.equal(await field.evaluate((n) => document.activeElement === n), true, 'the dialog opens on its field');

  await page.locator('#dlg').getByRole('button', { name: 'Open project' }).click();
  assert.equal(await field.getAttribute('aria-invalid'), 'true', 'an empty field is named, not skipped');
  assert.match(await page.locator('#dlg-error').textContent(), /Enter the folder/);

  await field.fill(tmp());
  await page.locator('#dlg').getByRole('button', { name: 'Open project' }).click();
  await page.waitForFunction(() => /no research canvas/.test(document.getElementById('dlg-error').textContent));
  const offer = page.getByRole('button', { name: 'Create a project instead…' });
  assert.equal(await offer.isVisible(), true, 'a folder without a canvas gets an offer to create one');
  await offer.click();
  assert.equal(await page.getByRole('heading', { name: 'New project' }).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'start-open', 'Escape returns to the control that opened the first dialog');
});

test('with a host bridge, Choose… fills the field from the native picker', { skip, timeout: 120000 }, async (t) => {
  const root = await makeProject();
  const srv = await startApp(t);
  const page = await openPage(t, srv, { host: true });
  await page.getByRole('button', { name: 'Open project…' }).click();
  const choose = page.getByRole('button', { name: 'Choose…' });
  assert.equal(await choose.isVisible(), true);
  await page.evaluate((picked) => { window.__picked = picked; }, root);
  await choose.click();
  assert.equal(await page.getByLabel('Project folder').inputValue(), root);
  await page.locator('#dlg').getByRole('button', { name: 'Open project' }).click();
  await page.locator('#proj-name').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'proj-name', 'focus lands on the opened project');
  await sessionView(page).locator('#poster.active').waitFor();
  assert.match(await page.locator('#out-project').textContent(), /Opened /);
});

test('the whole flow from a browser tab: new project, session, agenda, minutes, invitation', { skip, timeout: 180000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  const parent = tmp();
  await page.getByRole('button', { name: 'New project…' }).click();
  assert.match(await page.locator('#dlg').textContent(), /writes the research canvas \(research\/canvas\.md\)/, 'the dialog says which files are written');
  assert.equal(await page.locator('#dlg input[name="mode"]').count(), 3);
  await page.getByLabel('Folder to create it in').fill(parent);
  await page.getByLabel('Name of the new folder').fill('paper-one');
  await page.getByLabel('Working title of the paper').fill('Why proposals get dropped');
  await page.locator('#dlg').getByRole('radio', { name: /^Seed/ }).check();
  await page.locator('#dlg').getByRole('button', { name: 'Create project' }).click();
  await page.waitForFunction(() => document.getElementById('proj-name').textContent.length > 0);
  assert.equal((await page.locator('#proj-name').textContent()).trim(), 'Why proposals get dropped');
  assert.match(await page.locator('#proj-path').textContent(), /paper-one$/);
  assert.ok(fs.existsSync(path.join(parent, 'paper-one', 'research', 'canvas.md')));
  await sessionView(page).locator('#poster.active').waitFor();

  await page.getByRole('button', { name: 'Agenda' }).click();
  await sessionView(page).locator('#agenda.active').waitFor();

  await page.getByRole('button', { name: 'Start session…' }).click();
  await page.locator('#dlg').getByRole('button', { name: 'Start session' }).click();
  assert.equal(await page.getByLabel('What is the occasion?').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('What is the occasion?').fill('Supervision');
  await page.locator('#dlg').getByRole('button', { name: 'Start session' }).click();
  await page.locator('#live').waitFor();
  assert.match(await page.locator('#live').textContent(), /Session running · 0:00/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'live');
  assert.match(fs.readFileSync(path.join(parent, 'paper-one', 'research', 'decisions.md'), 'utf8'), /SESSION · Supervision/);

  const minutes = path.join(tmp(), 'minutes.md');
  await page.getByRole('button', { name: 'Export minutes…' }).click();
  await page.getByLabel('Save the minutes as').fill(minutes);
  await page.locator('#dlg').getByRole('button', { name: 'Export minutes' }).click();
  await page.waitForFunction(() => /Saved the minutes/.test(document.getElementById('out-meeting').textContent));
  assert.ok(fs.existsSync(minutes));

  const keyFile = path.join(tmp(), 'paper-one.seal.key');
  await page.getByRole('button', { name: 'Invite co-author…' }).click();
  assert.match(await page.locator('#dlg').textContent(), /Do not paste it into a chat with an agent/);
  await page.getByLabel('Save the key file as').fill(keyFile);
  await page.locator('#dlg').getByRole('button', { name: 'Save key file' }).click();
  await page.waitForFunction(() => /Saved the key file/.test(document.getElementById('out-people').textContent));
  assert.ok(fs.existsSync(keyFile));
});

test('Join this project… appears only where the key is missing, and joins with a key file and a name', { skip, timeout: 120000 }, async (t) => {
  const { b, keyFile } = await twoPeopleSharingOneProject();
  // A second machine: same project, no key and no name in this state directory.
  const bare = await appGit.clone({ url: sh(b, 'remote', 'get-url', 'origin').trim(), parent: tmp(), folder: 'second' });
  assert.equal(bare.ok, true, bare.error);
  const joiner = bare.root;
  const keyPath = require('../hooks/lib/seal').keyPath(joiner);
  const saved = fs.existsSync(keyPath) ? fs.readFileSync(keyPath) : null;
  if (saved) fs.renameSync(keyPath, `${keyPath}.away`);
  t.after(() => { if (saved) fs.renameSync(`${keyPath}.away`, keyPath); });
  const srv = await startApp(t, { open: joiner });
  const page = await openPage(t, srv);
  const join = page.getByRole('button', { name: 'Join this project…' });
  await join.waitFor();
  await join.click();
  await page.getByLabel('Key file you received').fill(keyFile);
  await page.getByLabel('Your name').fill('C. Newcomer');
  await page.locator('#dlg').getByRole('button', { name: 'Join project' }).click();
  await page.waitForFunction(() => /You joined/.test(document.getElementById('out-people').textContent));
  assert.equal(await join.isVisible(), false, 'with the key in place Join goes away');
});

for (const colorScheme of ['light', 'dark']) {
  test(`keyboard path, focus contrast and reflow in ${colorScheme}`, { skip, timeout: 120000 }, async (t) => {
    const root = await makeProject();
    const srv = await startApp(t, { open: root });
    const page = await openPage(t, srv, { colorScheme });
    await page.locator('#proj-name').waitFor();
    await sessionView(page).locator('#poster.active').waitFor();

    // Keyboard path: the skip link, then the sidebar controls in reading order.
    const order = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.id));
    }
    const expected = ['skip-link', 'btn-update', 'btn-send', 'btn-open', 'btn-clone', 'btn-new', 'btn-session', 'btn-agenda', 'btn-minutes', 'btn-invite'];
    assert.deepEqual(order.slice(0, expected.length), expected, 'Tab walks the sidebar in reading order');

    const ratios = await focusContrastRatios(page);
    assert.ok(ratios.length >= 9, 'the sidebar controls were measured');
    for (const item of ratios) assert.ok(item.ratio >= 3, `${item.label}: focus contrast >= 3:1 (${item.ratio.toFixed(2)})`);
    t.diagnostic(`lowest focus contrast ${Math.min(...ratios.map((i) => i.ratio)).toFixed(2)}:1 in ${colorScheme}`);

    // Dialog fields show the same ring, and the dialog holds focus.
    await page.getByRole('button', { name: 'New project…' }).click();
    await page.locator('#dlg input[name="folder"]').focus();
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth), '3px');
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.activeElement === document.body || document.getElementById('dlg').contains(document.activeElement)), 'Tab never leaves the dialog');
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-new', 'Escape returns to the invoker');

    // Reflow at 320 px: the sidebar stacks above the view, nothing scrolls sideways.
    await page.setViewportSize({ width: 320, height: 700 });
    let widths = await documentWidths(page);
    assert.equal(widths.document, widths.viewport, 'project page reflows at 320 px');
    await page.getByRole('button', { name: 'New project…' }).click();
    widths = await documentWidths(page);
    assert.equal(widths.document, widths.viewport, 'dialog reflows at 320 px');
    const bounds = await page.locator('#dlg').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'the dialog fits the viewport');
  });
}

test('first-start page reflows at 320 px in light and dark', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv, { viewport: { width: 320, height: 700 } });
  await page.getByRole('heading', { name: 'Start with a paper project' }).waitFor();
  let widths = await documentWidths(page);
  assert.equal(widths.document, widths.viewport);
  await page.emulateMedia({ colorScheme: 'dark' });
  widths = await documentWidths(page);
  assert.equal(widths.document, widths.viewport);
  const ratios = await focusContrastRatios(page);
  for (const item of ratios) assert.ok(item.ratio >= 3, `${item.label}: focus contrast >= 3:1 (${item.ratio.toFixed(2)})`);
});

test('a second window with a used code says so and offers no controls', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('heading', { name: 'Start with a paper project' }).waitFor();
  await page.goto('about:blank');
  await page.goto(`http://127.0.0.1:${srv.port}/app#c=${srv.code}`);
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /already opened elsewhere/);
  assert.equal(await page.getByRole('button').count(), 0);
});
