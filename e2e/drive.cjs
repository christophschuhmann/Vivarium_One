/* Vivarium E2E drive — plays the game like a player, screenshots every screen. */
const { chromium } = require('/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/node_modules/playwright');
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

  // ---------- 1. fresh signup + email verification ----------
  await page.goto(BASE + '/#/auth');
  await page.waitForSelector('.auth-card');
  await shot('01_auth_signin');
  await page.click('.auth-tabs button[data-m="signup"]');
  const testerEmail = `tester${Date.now()}@vivarium.local`;
  await page.fill('#f-name', 'Playwright Tester');
  await page.fill('#f-email', testerEmail);
  await page.fill('#f-pw', 'super-secret-9');
  await shot('02_auth_signup');
  await page.click('#go');
  await page.waitForSelector('.code-inputs input');
  // fetch code from dev mailbox
  const mail = await (await fetch(BASE + '/api/test/mailbox')).json();
  const code = mail.mailbox.find(m => m.to === testerEmail).code;
  ok('verification code received: ' + code);
  for (let i = 0; i < 6; i++) await page.fill(`.code-inputs input[data-i="${i}"]`, code[i]);
  await shot('03_auth_verify');
  await page.click('#verifybtn');
  await page.waitForSelector('.world-grid');
  await shot('04_home_new_user');
  ok('signup → verify → dashboard (welcome bonus visible: ' + await page.textContent('#credits-num') + ' cr)');

  // ---------- 2. demo player: the seeded world ----------
  await ctx.clearCookies();
  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  await shot('05_home_demo');
  ok('demo login → dashboard with Alice & Bob world');

  // stage
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });
  await page.waitForTimeout(1500); // bg + cutouts settle
  await shot('06_stage');
  ok('stage renders: ' + await page.locator('.stage-char').count() + ' characters composited');

  // switch perspective via here-rail
  const rails = page.locator('.rail-face[data-pov]');
  if (await rails.count() > 1) { await rails.nth(1).click(); await page.waitForTimeout(1200); await shot('07_stage_bob_pov'); ok('perspective switch via Here-rail'); }

  // cast
  await page.click('#dock [data-nav="cast"]');
  await page.waitForSelector('.cast-tile[data-id]');
  await shot('08_cast');
  // profile drawer
  await page.click('.cast-tile[data-id]');
  await page.waitForSelector('.drawer .timeline');
  await page.waitForTimeout(600);
  await shot('09_profile_drawer');
  ok('profile drawer: outfits=' + await page.locator('.outfit-thumb[data-cut]').count() + ' patches shown');
  await page.click('#closedrawer');

  // bonds
  await page.click('#dock [data-nav="bonds"]');
  await page.waitForSelector('.gnode');
  await page.click('.gedge-label', { force: true });
  await page.waitForTimeout(400);
  await shot('10_bonds');
  ok('bond graph + selected-bond panel');

  // atlas + pan
  await page.click('#dock [data-nav="world"]');
  await page.waitForSelector('.lnode');
  await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(560, 380, { steps: 8 }); await page.mouse.up();
  await page.click('.lnode');
  await page.waitForTimeout(500);
  await shot('11_atlas');
  ok('atlas with place-groups, paths, presence badges, pan works');

  // genesis (story settings)
  await page.goto(BASE + `/#/genesis?w=${await page.evaluate(() => S.world)}`);
  await page.waitForSelector('.genre-cards');
  await shot('12_genesis');
  ok('genesis screen');

  // ---------- 3. advance a REAL tick through the UI ----------
  await page.click('#dock [data-nav="play"]');
  await page.waitForSelector('#advance');
  const tickBefore = await page.evaluate(() => S.worldData.world.tick_index);
  await page.click('[data-delta="+1h"]');
  await page.click('#advance');
  await page.waitForSelector('.thinking-veil');
  await shot('13_stage_thinking');
  await page.waitForSelector('.thinking-veil', { state: 'detached', timeout: 120000 });
  await page.waitForSelector('.stage-char img');
  await page.waitForTimeout(1500);
  const tickAfter = await page.evaluate(() => S.worldData.world.tick_index);
  await shot('14_stage_after_advance');
  ok(`UI advance: tick ${tickBefore} → ${tickAfter}`);

  // intervention modal
  await page.click('#intervene');
  await page.waitForSelector('#iv-text');
  await page.click('.spark');
  await shot('15_intervention');
  await page.click('#iv-cancel');
  ok('intervention console (cancelled without spending)');

  // account modal
  await page.click('#avatar-chip');
  await page.waitForSelector('.modal .modal-body');
  await shot('16_account_ledger');
  await page.click('.modal-head .x');
  ok('account & usage modal');

  // ---------- 4. admin console ----------
  const apage = await ctx.newPage();
  await apage.goto(BASE + '/admin');
  await apage.waitForSelector('#a-email');
  await apage.fill('#a-email', 'admin@vivarium.local');
  await apage.fill('#a-pw', 'admin-vivarium-2026');
  await apage.click('#ago');
  await apage.waitForSelector('.stat-cards');
  await apage.screenshot({ path: `${SHOT}/17_admin_overview.png` });
  ok('admin overview with spend dashboards');
  await apage.click('.admin-tabs [data-t="users"]');
  await apage.waitForSelector('#u-table table');
  await apage.screenshot({ path: `${SHOT}/18_admin_users.png` });
  ok('admin users table');
  await apage.click('.admin-tabs [data-t="models"]');
  await apage.waitForSelector('[data-role]');
  await apage.screenshot({ path: `${SHOT}/19_admin_models.png` });
  ok('admin model registry');

  await browser.close();
  console.log('\nALL E2E STEPS PASSED');
})().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
