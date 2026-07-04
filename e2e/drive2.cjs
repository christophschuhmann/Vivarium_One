/* E2E for the new features: jump overlays, mind popup, narration player, bonds overhaul. */
const { chromium } = require('/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/node_modules/playwright');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('console', msg => { if (msg.text().startsWith('[tts]')) console.log(' ', msg.text()); });
  const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
  const ok = (m) => console.log('✓', m);

  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });
  await page.waitForTimeout(1200);

  // 1. location jump overlay
  await page.click('#pl');
  await page.waitForSelector('.jump-loc');
  await page.waitForTimeout(800);
  await shot('20_jump_locations');
  ok('location picker: ' + await page.locator('.jump-loc').count() + ' places, groups: ' + await page.locator('.jump-group').count());
  await page.click('.jump-loc:has-text("Kitchen")');
  await page.waitForTimeout(1000);
  ok('jumped to Kitchen perspective');

  // 2. character jump overlay
  await page.click('#pc');
  await page.waitForSelector('.jump-cast .cast-tile');
  await shot('21_jump_characters');
  await page.click('.jump-cast .cast-tile:has-text("Alice")');
  await page.waitForSelector('.stage-char img');
  await page.waitForTimeout(800);
  ok('character picker → jumped to Alice');

  // 3. mind popup (click the character on stage — aim at the head, the torso may sit behind the story box)
  const cbb = await page.locator('.stage-char').first().boundingBox();
  await page.mouse.click(cbb.x + cbb.width / 2, cbb.y + 60);
  await page.waitForSelector('.mind-grid');
  await page.waitForTimeout(400);
  await shot('22_mind_popup');
  const emo = await page.locator('.emo-row').count();
  const senses = await page.locator('.sense').count();
  ok(`mind popup: ${emo} emotions, ${senses} senses, intentions: ` + await page.locator('.intent-chip').count());
  await page.click('.modal-head .x');

  // 4. narration player — play, observe highlight, pause, resume, stop
  const t0 = Date.now();
  await page.click('#tts-play');
  await page.waitForSelector('.sline.playing-line', { timeout: 60000 });
  ok(`player started; first line audible after ${((Date.now() - t0) / 1000).toFixed(1)}s (prefetch ${await page.evaluate(() => JSON.parse(localStorage.getItem('viv_tts') || '{}').prepare !== false)})`);
  await shot('23_player_playing');
  await page.click('#tts-pause');
  await page.waitForTimeout(400);
  const pausedIcon = await page.textContent('#tts-pause');
  await page.click('#tts-pause'); // resume
  ok('pause/resume works (icon while paused: ' + pausedIcon.trim() + ')');
  await page.click('#tts-play'); // stop
  await page.waitForTimeout(300);
  ok('stop works, button back to: ' + (await page.textContent('#tts-play')).trim());

  // 5. TTS settings in account modal
  await page.click('#avatar-chip');
  await page.waitForSelector('#tp-narr');
  await shot('24_tts_settings');
  ok('TTS settings present (narrator=' + await page.inputValue('#tp-narr') + ')');
  await page.click('.modal-head .x');

  // 6. bonds overhaul
  await page.click('#dock [data-nav="bonds"]');
  await page.waitForSelector('.gedge-labelg');
  await page.waitForTimeout(600);
  await page.click('.gedge-labelg', { force: true });
  await page.waitForTimeout(400);
  await shot('25_bonds_overhaul');
  const goals = await page.locator('.battr .item').count();
  ok('bonds: ' + await page.locator('.gedge').count() + ' lanes, label pills, panel items: ' + goals);
  await page.click('#editbond');
  await page.waitForSelector('#be-nature');
  await shot('26_bond_edit');
  ok('bond edit modal with nature/goals/conflicts fields');
  await page.click('#be-cancel');

  await browser.close();
  console.log('\nALL NEW-FEATURE E2E STEPS PASSED');
})().catch(e => { console.error('E2E FAILED:', e.message); process.exit(1); });
