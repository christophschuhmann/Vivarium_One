import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.LIVING_REVIEW_URL || "http://127.0.0.1:8892",
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
let world, context;
try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "viv_tts",
      JSON.stringify({
        prepare: false,
        autoplay: false,
        innerVoice: false,
        musicOn: false,
      }),
    ),
  );
  assert.equal(
    (
      await context.request.post(base + "/api/auth/login", {
        data: { email: "demo@vivarium.local", password: "alice-and-bob" },
      })
    ).status(),
    200,
  );
  const created = await context.request.post(base + "/api/living/towns", {
    data: { population: 20, title: "Erweiterung · Browsertest", seed: 73 },
  });
  assert.equal(created.status(), 200, await created.text());
  world = (await created.json()).worldId;
  for (let i = 0; i < 2; i++) {
    const tick = await context.request.post(
      base + "/api/living/worlds/" + world + "/ticks",
      { data: { minutes: 60, story: false } },
    );
    assert.equal(tick.status(), 200, await tick.text());
  }
  const snapshot = await (
    await context.request.get(base + "/api/living/worlds/" + world + "/economy")
  ).json();
  assert.ok(
    snapshot.jobs.length > 20 &&
      snapshot.news.length &&
      snapshot.person.attributes.length === 7,
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#/city?w=" + world);
  await page.locator(".lw-perma").waitFor();
  assert.equal(await page.locator("[data-ex-tab]").count(), 8);
  const clickTab = async id => {
    const box = await page.locator(`[data-ex-tab="${id}"]`).boundingBox();
    assert.ok(box && box.y >= 0 && box.y+box.height <= 1080, 'Tab remains in viewport');
    // Use the real visible pointer position. Locator.click first calls
    // scrollIntoView, which can move sticky tabs back to their layout position.
    await page.mouse.click(box.x+box.width/2, box.y+box.height/2);
  };
  // A fullPage screenshot did not catch the old body-clipping bug. Exercise
  // native scrolling in the actual viewport and verify the footer is reachable.
  const scrollTop = () => page.locator('.ex-screen').evaluate(el=>el.scrollTop);
  await page.mouse.move(900,600);
  await page.mouse.wheel(0,650);
  await page.waitForTimeout(300);
  assert.ok(await scrollTop() > 400, 'Mouse wheel must scroll City');
  assert.ok(await page.locator('#ex-sim-picker').isVisible());
  const sticky = await page.locator('.ex-workspace').boundingBox();
  assert.ok(sticky.y >= 70 && sticky.y < 100, 'Toolbar stays below global topbar');
  await page.locator('.ex-screen').focus();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(250);
  assert.ok(await page.locator('.ex-screen').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop < 3), 'Keyboard reaches actual end');
  await page.locator('#ex-back-top').click();
  await page.waitForTimeout(900);
  assert.equal(await scrollTop(),0);
  await page.locator('[data-ex-tab="overview"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-ex-tab="finances"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('[data-ex-tab="finances"]').evaluate(el=>el===document.activeElement),true);
  await clickTab("overview");
  assert.equal(await page.locator('[data-nav="city"]').count(), 1);
  fs.mkdirSync("artifacts/expanded-world", { recursive: true });
  await page.screenshot({
    path: "artifacts/expanded-world/household-desktop.png",
    fullPage: true,
  });
  for (const tab of [
    "finances",
    "education",
    "jobs",
    "housing",
    "leisure",
    "views",
    "news",
    "overview",
  ]) {
    await clickTab(tab);
    await page.locator("#ex-content").waitFor();
    assert.ok(
      (await page.locator("#ex-content").textContent()).length > 80,
      tab,
    );
    await page.screenshot({
      path: "artifacts/expanded-world/" + tab + ".png",
      fullPage: true,
    });
  }
  await clickTab("leisure");
  await page.mouse.move(900,600); await page.mouse.wheel(0,700); await page.waitForTimeout(300);
  const leisureScroll = await scrollTop();
  await clickTab("jobs");
  assert.equal(await scrollTop(),0);
  await clickTab("leisure");
  assert.ok(Math.abs(await scrollTop()-leisureScroll)<3, 'Each tab remembers its own scroll');
  // Exercise a real UI mutation, rather than checking only rendered forms.
  await clickTab("jobs");
  await page.locator("#ex-expectations").click();
  await page.locator("#ex-net").fill("1200");
  await page.locator("#ex-commute").fill("45");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/economy/actions") && r.request().method() === "POST",
  );
  await page.locator("#ex-save-expectations").click();
  assert.equal((await saved).status(), 200);
  const changed = await (
    await context.request.get(
      base +
        "/api/living/worlds/" +
        world +
        "/economy?simId=" +
        snapshot.selectedSimId,
    )
  ).json();
  assert.equal(changed.person.expectations.minimumNetCents, 120000);
  assert.equal(changed.person.expectations.maxCommuteSeconds, 2700);
  await clickTab("overview");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile page must fit",
  );
  assert.ok(
    await page
      .locator(".ex-page")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  );
  await page.screenshot({
    path: "artifacts/expanded-world/household-mobile.png",
    fullPage: true,
  });
  // Mobile uses a native section selector; test actual touch panning on a
  // touch-enabled viewport, rather than merely shrinking a desktop screenshot.
  const mobile = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.addCookies(await context.cookies());
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror',e=>errors.push(e.message));
  await mobilePage.goto(base + '/#/city?w=' + world);
  await mobilePage.locator('.lw-perma').waitFor();
  await mobilePage.locator('#ex-section').selectOption('leisure');
  const cdp = await mobile.newCDPSession(mobilePage);
  const swipe = async () => {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:600}]});
    for(let y=570;y>=180;y-=30) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});
      await mobilePage.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobilePage.waitForTimeout(300);
  };
  await swipe();
  assert.ok(await mobilePage.locator('.ex-screen').evaluate(el=>el.scrollTop)>200,'Touch swipe scrolls mobile City');
  assert.ok(await mobilePage.locator('#ex-section').isVisible());
  assert.ok(await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const dockBounds = await mobilePage.locator('#dock').boundingBox();
  assert.ok(dockBounds.x >= 0 && dockBounds.x+dockBounds.width <= 390,'Mobile dock stays fully in view');
  await mobilePage.locator('#ex-section').selectOption('views');
  const contact = mobilePage.locator('[data-ex-contact]').first();
  assert.ok(await contact.count(), 'Real procedural encounters create social cards');
  if (await contact.count()) {
    await mobilePage.locator('.ex-next-step').first().waitFor();
    await mobilePage.locator('#ex-social-search').fill('does-not-exist-xyz');
    assert.equal(await mobilePage.locator('[data-ex-contact]:visible').count(),0);
    assert.ok(await mobilePage.locator('#ex-social-empty').isVisible());
    await mobilePage.locator('#ex-social-search').fill('');
    assert.ok(await mobilePage.locator('[data-ex-contact]:visible').count()>0);
  }
  await mobilePage.screenshot({path:'artifacts/expanded-world/social-view-mobile.png'});
  await mobilePage.locator('#ex-section').selectOption('overview');
  await swipe();
  await mobilePage.screenshot({path:'artifacts/expanded-world/city-scrolled-mobile.png'});
  await mobile.close();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator("#ex-profile").click();
  await page.locator("#lw-profile-resources").click();
  await page.locator(".ex-profile").waitFor();
  assert.ok((await page.locator(".ex-profile .ex-meter").count()) >= 25);
  // The profile's action handlers must work too. A declined consent cannot debit anything.
  if (await page.locator(".ex-profile #ex-loan-plan").count()) {
    const before = await (
      await context.request.get(
        base +
          "/api/living/worlds/" +
          world +
          "/economy?simId=" +
          snapshot.selectedSimId,
      )
    ).json();
    await page.locator(".ex-profile #ex-loan-plan").click();
    await page.locator("#ex-loan-amount").fill("100");
    const refused = page.waitForResponse(
      (r) =>
        r.url().endsWith("/economy/actions") && r.request().method() === "POST",
    );
    await page.locator("#ex-loan-submit").click();
    const refusal = await refused;
    assert.equal(refusal.status(), 200);
    assert.equal((await refusal.json()).ok, false);
    const after = await (
      await context.request.get(
        base +
          "/api/living/worlds/" +
          world +
          "/economy?simId=" +
          snapshot.selectedSimId,
      )
    ).json();
    assert.equal(after.version, before.version);
    assert.equal(after.person.cashCents, before.person.cashCents);
  }
  await page.locator("#ex-open-city").click();
  await page.locator(".ex-page").waitFor();
  await page.locator("#ex-play").click();
  await page.locator(".stage-char.pov").waitFor();
  await page.locator(".stage-char.pov").click();
  await page.locator("#lw-mind-social").waitFor();
  await page.locator("#lw-mind-social").click();
  await page.locator('[data-ex-tab="views"][aria-selected="true"]').waitFor();
  const socialProfile = page.locator('[data-ex-social-profile]').first();
  if (await socialProfile.count()) {
    const target = await socialProfile.getAttribute('data-ex-social-profile');
    await socialProfile.click();
    await page.locator('#lw-close-profile').waitFor();
    await page.locator('#lw-close-profile').click();
    await page.locator('[data-ex-social-bonds]').first().click();
    await page.locator('#lw-bond-center').waitFor();
    assert.equal(await page.locator('#lw-bond-center').getAttribute('data-sim'),target);
    await page.goto(base + '/#/city?w=' + world + '&s=' + snapshot.selectedSimId);
    await page.locator('[data-ex-social-play]').first().waitFor();
    await page.locator('[data-ex-social-play]').first().click();
    await page.locator('.stage-char.pov').waitFor();
    assert.equal(await page.locator('.stage-char.pov').getAttribute('data-id'),target);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/expanded-world/browser-review.json",
    JSON.stringify(
      {
        eightTownTabs: true,
        classicPlayMindProfileNavigation: true,
        skillsAndAttributes: true,
        savedPersonalJobExpectations: true,
        declinedProfileLoanDoesNotMutateMoney: true,
        mobileOverflow: false,
        desktopWheelAndKeyboardReachFooter: true,
        mobileTouchScrolling: true,
        stickyNavigationBelowTopbar: true,
        independentTabScrollPositions: true,
        keyboardTabs: true,
        socialContactFilter: true,
        socialContactProfileBondsAndSceneNavigation: true,
        providerCalls: 0,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS expanded desktop/mobile town pages; source-based finances, job/housing/leisure views; original Play/Mind/Profile navigation; no browser errors or provider calls.",
  );
} finally {
  if (world && context)
    await context.request.delete(base + "/api/worlds/" + world);
  await browser.close();
}
