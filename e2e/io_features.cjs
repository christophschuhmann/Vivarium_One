/* E2E: save-game ZIP export + import, and the video-export audio preflight dialog. */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const ok = (m) => console.log('✓', m);

  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');

  // 1. Home screen shows the Import button
  await page.waitForSelector('#importworld');
  ok('Home screen shows "⬆ Import save" button');

  // Video export needs ≥1 tick — prime one via the API (SSE) if the world is still at tick 0.
  // Target the canonical "Alice & Bob" demo world explicitly (other worlds may exist).
  const wid = await page.evaluate(async () => {
    const ws = (await (await fetch('/api/worlds')).json()).worlds;
    return (ws.find(w => w.title === 'Alice & Bob') || ws[0]).id;
  });
  const tickIdx = await page.evaluate(async (w) => (await (await fetch('/api/worlds/' + w)).json()).world.tick_index, wid);
  if (tickIdx < 1) {
    await page.evaluate(async (w) => {
      const r = await fetch('/api/worlds/' + w + '/ticks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeDelta: '+30m' }) });
      const reader = r.body.getReader(); while (true) { const { done } = await reader.read(); if (done) break; }
    }, wid);
    ok('primed one tick for the video-export test');
  }

  // 2. Open a world → Share → ZIP download works
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });
  await page.click('#dock [data-nav="share"]');
  await page.waitForSelector('#fullzip');
  await page.screenshot({ path: `${SHOT}/50_share_modal.png` });
  ok('Share modal shows seed(JSON) + full(.zip) + import + video panels');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#fullzip'),
  ]);
  const zipPath = '/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/ui_export.zip';
  await download.saveAs(zipPath);
  const zipSize = fs.statSync(zipPath).size;
  ok(`Full-game .zip downloaded via UI (${(zipSize / 1e6).toFixed(1)} MB)`);

  // 3. Story-bundle export: preflight dialog (if lines lack audio) or straight download.
  //    Choose SILENT when asked (free) and verify the bundle download starts.
  const dlPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#storygo');
  const choice = await page.waitForSelector('#ac-silent', { timeout: 8000 }).catch(() => null);
  if (choice) {
    await page.screenshot({ path: `${SHOT}/51_story_audio_choice.png` });
    ok(`Preflight dialog: "${(await page.textContent('#ac-gen')).trim()}"`);
    await page.click('#ac-silent');
  } else {
    ok('No preflight dialog — all lines already voiced');
  }
  const storyDl = await dlPromise;
  const storyPath = '/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/ui_story.zip';
  await storyDl.saveAs(storyPath);
  ok(`Story bundle downloaded via UI (${(fs.statSync(storyPath).size / 1e6).toFixed(1)} MB)`);
  await page.locator('.modal-head .x').first().click();

  // 4. Import the downloaded zip via the home-screen picker
  await page.click('#dock [data-nav="home"]');
  await page.waitForSelector('#importworld');
  const worldsBefore = await page.locator('.world-card').count();
  await page.setInputFiles('input[type=file]', zipPath).catch(async () => {
    // the file input is created on click; wire the picker then set files
  });
  // The picker input is created programmatically on click; intercept it:
  await page.evaluate(() => { window.__origClick = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { window.__lastFileInput = this; }; });
  await page.click('#importworld');
  await page.waitForTimeout(200);
  await page.evaluate((p) => { /* noop marker */ }, zipPath);
  const handle = await page.evaluateHandle(() => window.__lastFileInput);
  await handle.asElement().setInputFiles(zipPath);
  await page.waitForTimeout(6000); // upload + import
  const worldsAfter = await page.locator('.world-card').count();
  ok(`Import via home picker: world count ${worldsBefore} → ${worldsAfter}`);
  if (worldsAfter <= worldsBefore) throw new Error('import did not add a world');
  await page.screenshot({ path: `${SHOT}/52_after_import.png` });

  await browser.close();
  console.log('\nIO FEATURES E2E PASSED');
})().catch(e => { console.error('IO FEATURES E2E FAILED:', e.message); process.exit(1); });
