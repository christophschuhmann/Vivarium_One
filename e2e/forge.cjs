/* E2E: the Forge zombie flow — chat, paint invite, progress animation, generation,
   plus "ask the assistant to draw" intent + graceful error on empty draft. */
const { chromium } = require('/tmp/claude-1003/-storage-spirit-zfs-vivarium/8780ab0d-efbe-4945-be18-43942cb77f23/scratchpad/node_modules/playwright');
const BASE = 'http://localhost:8890';
const SHOT = '/storage/spirit-zfs/vivarium/e2e/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
  const ok = (m) => console.log('✓', m);

  // create a fresh world so the Forge is empty
  await page.goto(BASE + '/#/auth');
  await page.fill('#f-email', 'demo@vivarium.local');
  await page.fill('#f-pw', 'alice-and-bob');
  await page.click('#go');
  await page.waitForSelector('.world-card');
  const wid = await page.evaluate(async () => {
    const r = await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Zombie Test' }) });
    return (await r.json()).world.id;
  });
  await page.goto(BASE + `/#/forge?w=${wid}`);
  await page.waitForSelector('#forge-in');

  // 1. describe a zombie
  await page.fill('#forge-in', 'I want a zombie character from the zombie apocalypse, a stitched-together anime zombie who still has his wits. Call him Zack.');
  await page.click('#forge-send');
  await page.waitForFunction(() => document.querySelectorAll('.msg.assistant').length >= 2, { timeout: 40000 });
  await page.waitForSelector('#attrs .attr', { timeout: 5000 });
  await page.waitForTimeout(500);
  // the paint button should now invite the click (primary + pulsing) if appearance is set
  const paintable = await page.evaluate(() => {
    const pb = document.querySelector('#paint');
    return { primary: pb.classList.contains('btn-primary'), hint: getComputedStyle(document.querySelector('#paint-hint')).display };
  });
  await shot('28_forge_paintable');
  ok(`draft built; paint invites the click (primary=${paintable.primary}, hint=${paintable.hint})`);

  // 2. ask the ASSISTANT in words to draw — the bug the user hit
  await page.fill('#forge-in', 'Great, now generate an image of him please!');
  await page.click('#forge-send');
  // progress animation should appear
  await page.waitForSelector('.genprog', { timeout: 40000 });
  await page.waitForTimeout(4500); // let a stage advance
  await shot('29_forge_generating');
  const stage = await page.textContent('#gen-txt').catch(() => '');
  ok(`"generate an image" via chat → generation started; stage text: "${stage.trim()}"`);

  // 3. wait for the portrait to land
  await page.waitForSelector('#portrait-box img', { timeout: 90000 });
  await page.waitForTimeout(500);
  await shot('30_forge_done');
  const accept = await page.evaluate(() => !document.querySelector('#accept').disabled);
  ok(`portrait rendered; Accept enabled=${accept}`);

  // 4. graceful path: brand-new world, ask to draw with NO appearance yet
  const wid2 = await page.evaluate(async () => {
    const r = await fetch('/api/worlds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Empty Draft Test' }) });
    return (await r.json()).world.id;
  });
  await page.goto(BASE + `/#/forge?w=${wid2}`);
  await page.waitForSelector('#paint');
  await page.click('#paint'); // click paint with no draft at all
  await page.waitForFunction(() => [...document.querySelectorAll('.msg.assistant')].some(m => /how they look|hair|paint them/i.test(m.textContent)), { timeout: 5000 });
  ok('clicking Paint with an empty draft → assistant gracefully asks for a description (no silent no-op)');

  // cleanup: these are throwaway test worlds, not the demo's real "Alice & Bob"
  await page.evaluate(async ([w1, w2]) => {
    await fetch(`/api/worlds/${w1}`, { method: 'DELETE' });
    await fetch(`/api/worlds/${w2}`, { method: 'DELETE' });
  }, [wid, wid2]);
  ok('cleaned up throwaway test worlds');

  await browser.close();
  console.log('\nFORGE E2E PASSED');
})().catch(e => { console.error('FORGE E2E FAILED:', e.message); process.exit(1); });
