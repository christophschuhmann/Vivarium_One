/* E2E: the story box must reflect the CURRENTLY-VIEWED location, not a stale scene. */
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

  // where are the characters right now, and what's the scene text?
  const info0 = await page.evaluate(() => {
    const t = S.worldData; return null; // placeholder
  });
  const sceneAtCurrent = (await page.textContent('#storylines')).replace(/\s+/g, ' ').trim();
  const curLoc = (await page.textContent('.stage-hud')).match(/· (.+?) · tick/)?.[1];
  ok(`viewing ${curLoc}; story box: "${sceneAtCurrent.slice(0, 80)}…"`);

  // find a location where NOBODY is present, switch to it
  const emptyLoc = await page.evaluate(() => {
    const occupied = new Set(S.worldData.characters.map(c => c.state.location_id));
    const empty = S.worldData.locations.find(l => !occupied.has(l.id));
    return empty ? { id: empty.id, name: empty.name } : null;
  });
  await page.evaluate((id) => { stopNarration(); stageState.pov = { type: 'location', id }; stageScreen(); }, emptyLoc.id);
  await page.waitForTimeout(600);
  const sceneAtEmpty = (await page.textContent('#storylines')).replace(/\s+/g, ' ').trim();
  await page.screenshot({ path: `${SHOT}/35_scene_empty_location.png` });
  ok(`switched to empty ${emptyLoc.name}; story box: "${sceneAtEmpty.slice(0, 80)}…"`);

  // ASSERTIONS
  if (sceneAtEmpty === sceneAtCurrent) throw new Error('BUG NOT FIXED: story box unchanged after switching location');
  if (!new RegExp(emptyLoc.name.split(' ')[0], 'i').test(sceneAtEmpty)) throw new Error('story box does not mention the viewed location: ' + sceneAtEmpty);
  ok('story box now refers to the viewed location (bug fixed)');

  // switch back to a character POV → should show that character's scene again
  const someChar = await page.evaluate(() => S.worldData.characters[0].id);
  await page.evaluate((id) => { stopNarration(); stageState.pov = { type: 'character', id }; stageScreen(); }, someChar);
  await page.waitForTimeout(600);
  const sceneBack = (await page.textContent('#storylines')).replace(/\s+/g, ' ').trim();
  ok(`back to character POV; scene: "${sceneBack.slice(0, 70)}…"`);

  // narration player still works with location-aware lines
  await page.click('#tts-play');
  await page.waitForSelector('.sline.playing-line', { timeout: 60000 });
  ok('narration player plays the location-aware scene');
  await page.click('#tts-play'); // stop

  await browser.close();
  console.log('\nSCENE E2E PASSED');
})().catch(e => { console.error('SCENE E2E FAILED:', e.message); process.exit(1); });
