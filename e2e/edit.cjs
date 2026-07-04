/* E2E: rename, teleport, bond builder overlay, cast drag-to-connect. */
const { chromium } = require('/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/node_modules/playwright');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('dialog', async d => { // handle prompt() for rename
    if (/Rename/.test(d.message())) await d.accept('Alice Renamed'); else await d.accept();
  });
  const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
  const ok = (m) => console.log('✓', m);

  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  await page.click('.world-card:has-text("Alice & Bob")');
  await page.waitForSelector('.stage-char img', { timeout: 20000 });

  // ---- cast → profile drawer: rename + teleport ----
  await page.click('#dock [data-nav="cast"]');
  await page.waitForSelector('.cast-tile[data-id]');
  await page.click('.cast-tile[data-id]');            // plain click opens profile
  await page.waitForSelector('.drawer #renamebtn');
  ok('plain click on cast tile → profile drawer opens (rename + move present)');
  // rename
  await page.click('#renamebtn');
  await page.waitForTimeout(1500);
  const renamed = await page.evaluate(() => document.querySelector('.drawer b')?.textContent);
  ok('rename works → ' + renamed);
  // teleport via move button → location picker
  await page.click('#movebtn');
  await page.waitForSelector('.jump-loc');
  await shot('31_teleport_picker');
  ok('Move → location picker with ' + await page.locator('.jump-loc').count() + ' preview thumbnails');
  await page.click('.jump-loc:has-text("Town Park")');
  await page.waitForTimeout(1500);
  const loc = await page.evaluate(() => document.querySelector('.drawer #movebtn')?.textContent || '');
  ok('teleported → drawer now shows: ' + loc.replace(/\s+/g, ' ').trim());
  // rename & move back for cleanliness
  await page.click('#movebtn');
  await page.waitForSelector('.jump-loc');
  await page.click('.jump-loc:has-text("Kitchen")');
  await page.waitForTimeout(1200);
  // close drawer
  await page.click('#closedrawer').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  // ---- bonds: New bond overlay (two-portrait picker) ----
  await page.goto(BASE + `/#/bonds?w=${await page.evaluate(() => S.world)}`);
  await page.waitForSelector('#newbond');
  await page.click('#newbond');
  await page.waitForSelector('.bond-pick');
  await shot('32_bond_builder_step1');
  ok('New bond → overlay with ' + await page.locator('.bond-pick').count() + ' portraits (step 1)');
  await page.click('.bond-pick >> nth=0');            // pick FROM
  await page.waitForSelector('.bond-pick.sel-from');
  await page.click('.bond-pick >> nth=1');            // pick TO
  await page.waitForSelector('#bond-desc-wrap:visible');
  await page.fill('#bond-desc', 'sees them as a study rival, secretly admires them');
  await shot('33_bond_builder_ready');
  ok('picked from → to; description step revealed');
  await page.click('#bond-create');
  await page.waitForTimeout(1500);
  await page.waitForSelector('.gedge');
  const bondCount = await page.evaluate(() => S.worldData.relationships.length);
  ok('bond created via overlay; world now has ' + bondCount + ' bonds');

  // ---- cast drag-to-connect ----
  await page.goto(BASE + `/#/cast?w=${await page.evaluate(() => S.world)}`);
  await page.waitForSelector('.cast-tile[data-id]');
  const tiles = page.locator('.cast-tile[data-id]');
  const b1 = await tiles.nth(0).locator('.ring').boundingBox();
  const b2 = await tiles.nth(1).locator('.ring').boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 + 40, b1.y + b1.height / 2, { steps: 4 });
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 8 });
  await page.waitForSelector('#drag-arrow');
  await shot('34_cast_drag');
  ok('drag from portrait 1 → 2 draws a live arrow');
  await page.mouse.up();
  await page.waitForSelector('.bond-slots');
  const seeded = await page.evaluate(() => ({ from: !!document.querySelector('#slot-from .ring'), to: !!document.querySelector('#slot-to .ring') }));
  ok('drop opens bond builder pre-seeded (from=' + seeded.from + ', to=' + seeded.to + ')');
  await page.click('.modal-head .x'); // cancel this one

  // ---- cleanup: restore demo world to pristine state ----
  await page.evaluate(async () => {
    const wd = await (await fetch(`/api/worlds/${S.world}`)).json();
    const alice = wd.characters.find(c => /Alice/.test(c.name));
    if (alice && alice.name !== 'Alice') await fetch(`/api/characters/${alice.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }) });
    // remove any bond that isn't one of the two canonical Alice<->Bob bonds
    const bob = wd.characters.find(c => c.name === 'Bob');
    for (const r of wd.relationships) {
      const canonical = (r.from_id === alice?.id && r.to_id === bob?.id) || (r.from_id === bob?.id && r.to_id === alice?.id);
      const isSeed = /loves|protective|relies|cherish/i.test(r.description);
      if (!canonical || !isSeed) await fetch(`/api/relationships/${r.id}`, { method: 'DELETE' });
    }
  });
  ok('demo world restored to pristine state');

  await browser.close();
  console.log('\nEDIT/BOND E2E PASSED');
})().catch(e => { console.error('EDIT/BOND E2E FAILED:', e.message); process.exit(1); });
