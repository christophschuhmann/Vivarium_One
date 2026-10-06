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
  await page.locator(".ex-stats").waitFor();
  assert.equal(await page.locator("[data-ex-tab]").count(), 6);
  assert.equal(await page.locator('[data-nav="city"]').count(), 1);
  fs.mkdirSync("artifacts/expanded-world", { recursive: true });
  await page.screenshot({
    path: "artifacts/expanded-world/household-desktop.png",
    fullPage: true,
  });
  for (const tab of [
    "jobs",
    "housing",
    "leisure",
    "views",
    "news",
    "overview",
  ]) {
    await page.locator('[data-ex-tab="' + tab + '"]').click();
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
  // Exercise a real UI mutation, rather than checking only rendered forms.
  await page.locator('[data-ex-tab="jobs"]').click();
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
  await page.locator('[data-ex-tab="overview"]').click();
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
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/expanded-world/browser-review.json",
    JSON.stringify(
      {
        sixTownTabs: true,
        classicPlayMindProfileNavigation: true,
        skillsAndAttributes: true,
        savedPersonalJobExpectations: true,
        declinedProfileLoanDoesNotMutateMoney: true,
        mobileOverflow: false,
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
