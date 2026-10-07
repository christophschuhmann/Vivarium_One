// Each suite creates its own temporary database. No paid provider calls.
import fs from "node:fs";
import { spawn } from "node:child_process";
const suites = [
  "test-expanded-world.mjs",
  "test-finance-education-care.mjs",
  "test-expanded-semantics.mjs",
  "test-social-perspectives.mjs",
  "test-expanded-lifecycle.mjs",
  "test-living.mjs",
  "test-living-mind.mjs",
  "test-living-social.mjs",
  "test-living-romance.mjs",
  "test-living-wellbeing.mjs",
  "test-living-biographies.mjs",
  "test-providers.mjs",
  "test-storage.mjs",
];
if (
  process.env.MUSIC_DATA_DIR &&
  fs.existsSync(process.env.MUSIC_DATA_DIR + "/audio-index.json")
)
  suites.push("test-music.mjs");
const results = [];
for (const suite of suites) {
  const start = performance.now();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/" + suite], {
      cwd: new URL("../", import.meta.url),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) =>
      resolve({ exitCode: 1, output: error.message }),
    );
    child.on("close", (exitCode) => resolve({ exitCode, output }));
  });
  results.push({
    suite,
    passed: result.exitCode === 0,
    durationMs: Math.round(performance.now() - start),
  });
  console.log(
    (result.exitCode === 0 ? "PASS " : "FAIL ") +
      suite +
      " (" +
      results.at(-1).durationMs +
      " ms)",
  );
  if (result.exitCode !== 0) console.error(result.output);
}
fs.mkdirSync("artifacts/expanded-world", { recursive: true });
fs.writeFileSync(
  "artifacts/expanded-world/regression-review.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      node: process.version,
      providerCalls: 0,
      results,
    },
    null,
    2,
  ) + "\n",
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
