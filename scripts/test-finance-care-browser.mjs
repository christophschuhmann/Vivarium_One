// Independent real-browser review: no production DB and no provider requests.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vivarium-life-panels-"));
const socket = net.createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  VIV_DATA_DIR: scratch,
  VIV_HOST: "127.0.0.1",
  PORT: String(port),
  VIV_SECRET: "finance-browser-fixture",
  HYPRLAB_API_KEY: "",
  OPENROUTER_API_KEY: "",
  MUSIC_AUTOSTART: "0",
  MOCK_PROVIDERS: "1",
};
execFileSync(process.execPath, ["scripts/seed_demo.js"], {
  cwd: root,
  env,
  stdio: "pipe",
});
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: root,
  env,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
child.stdout.on("data", (x) => (logs = (logs + x).slice(-4000)));
child.stderr.on("data", (x) => (logs = (logs + x).slice(-4000)));
const errors = [],
  failures = [];
const requestError = (r) => {
  if (r.status() >= 500) failures.push(r.status() + " " + r.url());
};
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
    if (i === 99) throw Error(logs);
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", requestError);
  assert.equal(
    (
      await context.request.post(base + "/api/auth/login", {
        data: { email: "demo@vivarium.local", password: "alice-and-bob" },
      })
    ).status(),
    200,
  );
  const created = await context.request.post(base + "/api/living/towns", {
    data: { title: "Marktbogen · Stadtleben", population: 50, seed: 73 },
  });
  assert.equal(created.status(), 200);
  const world = (await created.json()).worldId;
  const economy = await (
      await context.request.get(
        base + "/api/living/worlds/" + world + "/economy",
      )
    ).json(),
    sim = economy.selectedSimId,
    route = "/#/city?w=" + world + "&s=" + sim;
  await page.goto(base + route);
  await page.locator("#ex-content .lw-perma").waitFor();
  assert.equal(await page.locator("[role=tab]").count(), 8);
  assert.equal(
    await page.locator("#ex-content #ex-loan-plan").count(),
    0,
    "finances removed from daily overview",
  );
  async function tab(name) {
    const box = await page.locator("[data-ex-tab=" + name + "]").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(80);
  }
  await tab("finances");
  await page.locator("#ex-finance-period").waitFor();
  assert.match(
    await page.locator("#ex-content").innerText(),
    /keine gespeicherten Buchungen/,
  );
  assert.match(await page.locator("#ex-content").innerText(), /Nächster Monat/);
  const financialBefore = await (
    await context.request.get(
      base + "/api/living/worlds/" + world + "/sims/" + sim + "/resources",
    )
  ).json();
  await page.locator("#ex-reserve").fill("250");
  await page.locator("#ex-reserve-form button").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#ex-reserve")?.value === "250" &&
      !document.querySelector("#ex-reserve")?.disabled,
  );
  await page.waitForTimeout(100);
  const financialAfter = await (
    await context.request.get(
      base + "/api/living/worlds/" + world + "/sims/" + sim + "/resources",
    )
  ).json();
  assert.equal(financialAfter.household.budget.irregularReserve, 25000);
  assert.equal(financialAfter.cashCents, financialBefore.cashCents);
  assert.equal(financialAfter.clock, financialBefore.clock);
  assert.ok(financialAfter.finances.lastAppraisal);
  await page.locator("#ex-finance-scope").selectOption("personal");
  await page.waitForFunction(
    () => exFinanceReport?.previous.scope === "personal",
  );
  await page.locator("#ex-finance-period").selectOption("current");
  await page.waitForFunction(() => exFinancePeriod === "current");
  assert.match(await page.locator("#ex-content").innerText(), /September 2026/);
  const trigger = page.locator("[data-concept=reserve]").first();
  await trigger.click();
  await page.getByRole("dialog").waitFor();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /bucht kein Geld ab/,
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement.closest("[role=dialog]")),
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.ok(
    await page.evaluate(
      () => document.activeElement.dataset.concept === "reserve",
    ),
  );
  await page.locator(".ex-screen").hover();
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () => document.querySelector(".ex-screen").scrollTop > 200,
    ),
  );
  const sticky = await page.locator(".ex-workspace").boundingBox();
  assert.ok(sticky.y >= 76 && sticky.y < 110);
  assert.ok(await page.locator("#ex-tab-education").isVisible());
  fs.mkdirSync("artifacts/expanded-world", { recursive: true });
  await page.screenshot({
    path: "artifacts/expanded-world/finances-scrolled-desktop.png",
  });
  await page.locator(".ex-screen").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "artifacts/expanded-world/finances-desktop.png",
  });
  await tab("education");
  await page.locator(".ex-timeline").waitFor();
  assert.match(await page.locator("#ex-content").innerText(), /Aktuell:/);
  assert.match(
    await page.locator("#ex-content").innerText(),
    /Ausgangsbiografie/,
  );
  assert.equal(await page.locator(".ex-current-status").count(), 1);
  await page.screenshot({
    path: "artifacts/expanded-world/education-desktop.png",
  });
  await tab("overview");
  assert.ok((await page.locator(".lw-perma-row [data-concept]").count()) === 5);
  await page.locator(".lw-perma-row [data-concept=M]").click();
  assert.match(await page.getByRole("dialog").innerText(), /Meaning/);
  await page.keyboard.press("Escape");
  await page.locator("#ex-profile").click();
  await page.locator("#lw-profile-resources").click();
  await page.locator("#ex-open-finances").click();
  await page.locator("#ex-finance-period").waitFor();
  assert.equal(
    await page.locator("[data-ex-tab=finances]").getAttribute("aria-selected"),
    "true",
    "profile finance shortcut also works when the City URL is unchanged",
  );
  await tab("views");
  assert.ok((await page.locator("#ex-content [data-concept=tom]").count()) > 0);
  assert.ok(
    !(await page.locator("#ex-content").innerText()).includes("${exInfo"),
  );
  await tab("jobs");
  assert.match(
    await page.locator("#ex-content").innerText(),
    /Zusagechance|Voraussetzungen|Nachweisen|zurzeit|Zurzeit/,
  );
  await tab("housing");
  assert.equal(
    await page
      .locator("button")
      .filter({ hasText: "Mietvertrag annehmen" })
      .count(),
    0,
  );
  assert.match(
    await page.locator("#ex-content").innerText(),
    /Bewerbung|Angebot/,
  );
  const residents = (
    await (
      await context.request.get(
        base + "/api/living/worlds/" + world + "/sims?limit=100",
      )
    ).json()
  ).sims;
  const elderly = residents.find((s) => s.activityStatus.kind === "home_care"),
    nursing = residents.find(
      (s) => s.activityStatus.kind === "residential_care",
    );
  assert.ok(elderly && nursing);
  await page.goto(base + "/#/city?w=" + world + "&s=" + elderly.id);
  await page
    .getByRole("button", { name: "Sim wechseln: " + elderly.name })
    .waitFor();
  await tab("education");
  assert.match(
    await page.locator("#ex-content").innerText(),
    /Unterstützung zu Hause/,
  );
  await page.goto(base + "/#/city?w=" + world + "&s=" + nursing.id);
  await page
    .getByRole("button", { name: "Sim wechseln: " + nursing.name })
    .waitFor();
  await tab("education");
  assert.match(
    await page.locator("#ex-content").innerText(),
    /Seniorenhaus Lindenblick/,
  );
  await page.screenshot({ path: "artifacts/expanded-world/care-desktop.png" });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobile.addCookies(await context.cookies());
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  mp.on("response", requestError);
  await mp.goto(base + route);
  await mp.locator("#ex-section").waitFor();
  await mp.locator("#ex-section").selectOption("finances");
  await mp.locator("#ex-finance-period").waitFor();
  assert.ok(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await mp.screenshot({ path: "artifacts/expanded-world/finances-mobile.png" });
  await mp.locator(".ex-screen").evaluate((el) => {
    el.focus();
    el.scrollTop = el.scrollHeight;
  });
  await mp.locator("#ex-section").selectOption("education");
  await mp.locator(".ex-timeline").waitFor();
  assert.ok(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await mp.screenshot({
    path: "artifacts/expanded-world/education-mobile.png",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  fs.writeFileSync(
    "artifacts/expanded-world/life-panels-browser-review.json",
    JSON.stringify(
      {
        eightTownTabs: true,
        profileShortcutOnSameCityUrl: true,
        financialControlsAndOwnLedger: true,
        reserveIsPlanNotPayment: true,
        financialFeelingAndPermaEvidence: true,
        educationTimeline: true,
        careStatuses: true,
        contextHelpKeyboardAndFocus: true,
        desktopScrollStickyNavigation: true,
        mobileOverflow: false,
        providerCalls: 0,
        errors,
        failures,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS finance/education/care, eight tabs, explanations, desktop/mobile scrolling and actual reserve plan.",
  );
} finally {
  await browser?.close();
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await new Promise((r) => {
    if (child.exitCode !== null) return r();
    child.once("exit", r);
    setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
      r();
    }, 1500).unref();
  });
  fs.rmSync(scratch, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
