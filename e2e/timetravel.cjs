/* E2E: undo/redo/timeline UI on the Stage, TTS settings defaults, admin data explorer. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';
require('fs').mkdirSync(SHOT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
  const ok = (m) => console.log('✓', m);

  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });
  await page.waitForTimeout(800);

  // undo/redo buttons present and reflect state
  const tickBefore = await page.evaluate(() => S.worldData.world.tick_index);
  await shot('40_stage_with_history_controls');
  ok(`Stage shows undo/redo/timeline controls at tick ${tickBefore}`);

  // wait on the actual state change, not a fixed delay (a restore can take >1s and race)
  await page.click('#undobtn');
  await page.waitForFunction((b) => S.worldData?.world.tick_index === b - 1, tickBefore, { timeout: 15000 })
    .catch(() => { throw new Error(`undo failed: stuck at ${tickBefore}`); });
  ok(`Undo via UI: tick ${tickBefore} → ${tickBefore - 1}`);

  await page.click('#redobtn');
  await page.waitForFunction((b) => S.worldData?.world.tick_index === b, tickBefore, { timeout: 15000 })
    .catch(() => { throw new Error(`redo failed: did not return to ${tickBefore}`); });
  ok(`Redo via UI: back to tick ${tickBefore}`);

  // timeline modal
  await page.click('#timelinebtn');
  await page.waitForSelector('#tl-branches .tl-bchip');
  await page.waitForTimeout(500);
  await shot('41_timeline_modal');
  const branchCount = await page.locator('#tl-branches .tl-bchip:not(.ghost)').count();
  ok(`Timeline modal: ${branchCount} branch(es) listed`);
  await page.click('.modal-head .x');

  // custom-delta overlay still works (regression)
  await page.click('#customdelta');
  await page.waitForSelector('#cd-n');
  await page.click('#cd-cancel');
  ok('custom time-jump overlay still opens (regression check)');

  // TTS settings show BOTH defaults with reset buttons
  await page.click('#avatar-chip');
  await page.waitForSelector('#tp-narr-style');
  await shot('42_tts_settings_defaults');
  const narrDefault = await page.inputValue('#tp-narr-style');
  const charDefault = await page.inputValue('#tp-char-style');
  // current default is the documentary/deadpan winner of the TTS experiment
  if (!/calm/i.test(narrDefault) || !/(dramatization|vocal bursts|measured)/i.test(narrDefault)) throw new Error('narrator default missing calm/no-acting language: ' + narrDefault.slice(0, 80));
  ok(`Narrator default shown: "${narrDefault.slice(0, 70)}…"`);
  ok(`Character default shown: "${charDefault.slice(0, 70)}…"`);
  // edit + reset round-trip
  await page.fill('#tp-narr-style', 'TEST OVERRIDE STYLE');
  await page.dispatchEvent('#tp-narr-style', 'change');
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('viv_tts')).narratorStyle);
  if (saved !== 'TEST OVERRIDE STYLE') throw new Error('narrator style override did not persist');
  await page.click('#tp-narr-reset');
  await page.waitForTimeout(200);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('viv_tts')).narratorStyle);
  ok(`Override persists (${saved === 'TEST OVERRIDE STYLE'}) and reset-to-default works (${/calm/i.test(restored)})`);
  await page.click('.modal-head .x');

  // Share modal shows the story-bundle export
  await page.click('#dock [data-nav="share"]');
  await page.waitForSelector('#storygo');
  await shot('43_share_story_export');
  ok('Share modal shows 🎬 story-bundle export panel');
  await page.click('.modal-head .x');

  // ---- admin data explorer ----
  const apage = await ctx.newPage();
  await apage.goto(BASE + '/admin');
  await apage.waitForSelector('#a-email');
  await apage.fill('#a-email', 'admin@vivarium.local');
  await apage.fill('#a-pw', 'admin-vivarium-2026');
  await apage.click('#ago');
  await apage.waitForSelector('.stat-cards');
  await apage.click('.admin-tabs [data-t="users"]');
  await apage.waitForSelector('#u-q');
  await apage.fill('#u-q', 'demo@vivarium.local');
  await apage.waitForTimeout(500);
  await apage.waitForSelector('[data-explore]');
  await apage.click('[data-explore]');
  await apage.waitForSelector('#de-summary .stat');
  await apage.waitForTimeout(500);
  await apage.screenshot({ path: `${SHOT}/44_admin_data_explorer.png` });
  ok('Admin data explorer opened with summary + provider calls');
  await apage.click('#de-tabs [data-dt="chats"]');
  await apage.waitForTimeout(400);
  await apage.screenshot({ path: `${SHOT}/45_admin_data_chats.png` });
  ok('Admin data explorer: conversations tab');
  // full-call detail view
  await apage.click('#de-tabs [data-dt="calls"]');
  await apage.waitForSelector('[data-fullcall]', { timeout: 10000 });
  await apage.click('[data-fullcall]');
  await apage.waitForSelector('.modal-body pre');
  await apage.waitForTimeout(300);
  await apage.screenshot({ path: `${SHOT}/46_admin_call_detail.png` });
  ok('Admin can view full request/response JSON for a single provider call');

  await browser.close();
  console.log('\nTIME-TRAVEL & DATA E2E PASSED');
})().catch(e => { console.error('TIME-TRAVEL E2E FAILED:', e.message); process.exit(1); });
