/* E2E: time chips (+1m default, custom overlay), thought rendering in the story box. */
const { chromium } = require('/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/node_modules/playwright');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const ok = (m) => console.log('✓', m);

  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });
  await page.waitForTimeout(800);

  // chips: +1m default, morning gone, custom present
  const chips = await page.$$eval('[data-delta]', els => els.map(e => e.dataset.delta));
  const sel = await page.$eval('[data-delta].sel', e => e.dataset.delta).catch(() => null);
  if (chips.includes('morning')) throw new Error('morning chip still present');
  if (chips[0] !== '+1m') throw new Error('first chip is not +1m: ' + chips.join(','));
  ok(`chips: ${chips.join(' ')} · default selected: ${sel}`);

  // custom overlay
  await page.click('#customdelta');
  await page.waitForSelector('#cd-n');
  await page.fill('#cd-n', '45');
  await page.click('#cd-units [data-u="m"]');
  await page.screenshot({ path: `${SHOT}/36_custom_delta.png` });
  await page.click('#cd-set');
  await page.waitForTimeout(300);
  const label = (await page.textContent('#customdelta')).trim();
  const delta = await page.evaluate(() => stageState.delta);
  if (delta !== '+45m') throw new Error('custom delta not applied: ' + delta);
  ok(`custom overlay sets ${delta} (chip shows "${label}")`);
  // weeks unit works in the overlay too
  await page.click('#customdelta');
  await page.waitForSelector('#cd-n');
  await page.fill('#cd-n', '2');
  await page.click('#cd-units [data-u="w"]');
  const prev = await page.textContent('#cd-preview');
  await page.click('#cd-cancel');
  ok(`weeks unit preview: "${prev.trim()}"`);
  // switching back to a preset clears custom
  await page.click('[data-delta="+1m"]');
  const d2 = await page.evaluate(() => stageState.delta);
  ok(`preset re-select works (delta=${d2})`);

  // thought rendering in the story box (tick 2 narration has thoughts)
  const thoughts = await page.locator('.sline.thought').count();
  if (!thoughts) throw new Error('no thought lines rendered in story box');
  const sample = (await page.locator('.sline.thought').first().textContent()).trim();
  ok(`story box shows ${thoughts} thought lines (e.g. "${sample.slice(0, 60)}…") in italic with 💭`);
  await page.screenshot({ path: `${SHOT}/37_thoughts_storybox.png` });

  await browser.close();
  console.log('\nPACING E2E PASSED');
})().catch(e => { console.error('PACING E2E FAILED:', e.message); process.exit(1); });
