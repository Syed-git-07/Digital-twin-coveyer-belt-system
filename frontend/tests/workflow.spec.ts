import { test, expect } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get("/api/health");
          return response.ok() ? (await response.json()).status : "waiting";
        } catch {
          return "waiting";
        }
      },
      {
        timeout: 30000,
        message: "ConveyorLab API and worker must be ready at BASE_URL",
      },
    )
    .toBe("ok");
});

test("operator completes the live twin, prediction, comparison and archive workflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const setup = await page
    .getByRole("button", { name: "Create workspace" })
    .isVisible()
    .catch(() => false);
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.TEST_USERNAME || "acceptance-operator");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.TEST_PASSWORD || "acceptance-test-only-2026");
  if (setup)
    await page.getByRole("button", { name: "Create workspace" }).click();
  else await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Line overview" }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/auth/status")).json()).user
    .csrf;
  const cmd = async (action: string, values: object = {}) => {
    const response = await page.request.post("/api/commands", {
      headers: { "x-csrf-token": csrf },
      data: { action, values, idempotency_key: crypto.randomUUID() },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status, data.error).toBe("applied");
    return data;
  };
  let snapshot = await (await page.request.get("/api/snapshot")).json();
  if (!["idle", "ended", "interrupted"].includes(snapshot.state))
    await cmd("end");
  await page.getByRole("button", { name: "New run", exact: true }).click();
  await page.getByRole("button", { name: "Create run", exact: true }).click();
  await page.getByRole("button", { name: "Start line", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Simulation speed", exact: true })
    .selectOption("10");
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/snapshot")).json()).metrics
          .generated,
      { timeout: 20000 },
    )
    .toBeGreaterThan(2);
  await expect(page.locator("[data-parcel]").first()).toBeVisible();
  const parcel = page.locator("[data-parcel]").first(),
    id = await parcel.getAttribute("data-parcel"),
    position = await parcel.getAttribute("transform");
  await page.waitForTimeout(600);
  const tracked = page.locator(`[data-parcel="${id}"]`);
  if (await tracked.count())
    expect(await tracked.getAttribute("transform")).not.toBe(position);
  snapshot = await (await page.request.get("/api/snapshot")).json();
  const runId = snapshot.run_id,
    simTime = snapshot.simulation_time;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Line overview" }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/snapshot")).json())
          .simulation_time,
    )
    .toBeGreaterThan(simTime);
  expect((await (await page.request.get("/api/snapshot")).json()).run_id).toBe(
    runId,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  const paused = (await (await page.request.get("/api/snapshot")).json())
    .simulation_time;
  await page.waitForTimeout(900);
  expect(
    (await (await page.request.get("/api/snapshot")).json()).simulation_time,
  ).toBe(paused);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  await page.getByLabel("Arrival rate", { exact: true }).fill("45");
  await page.getByLabel("Outfeed service rate", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/snapshot")).json()).metrics.queue,
      { timeout: 30000 },
    )
    .toBeGreaterThan(8);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Predictions", exact: true }).click();
  await expect(page.getByText("Random forest", { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/snapshot")).json()).prediction
          .status,
      { timeout: 20000 },
    )
    .toBe("ready");
  await cmd("speed", { speed: 1 });
  await page
    .getByRole("button", { name: "Evaluate settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/snapshot")).json()).job?.status,
      { timeout: 30000 },
    )
    .not.toBe("running");
  const rec = (await (await page.request.get("/api/snapshot")).json())
    .recommendation;
  expect(rec).toBeTruthy();
  if (rec.status === "available") {
    await cmd("speed", { speed: 1 });
    const apply = page.getByRole("button", {
      name: "Apply recommendation",
      exact: true,
    });
    if (await apply.isEnabled()) {
      await apply.click();
      await expect
        .poll(
          async () =>
            (await (await page.request.get("/api/snapshot")).json())
              .recommendation.status,
        )
        .toBe("applied");
    }
  } else
    await expect(
      page.getByText("No beneficial change found", { exact: true }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page.getByLabel("Duration", { exact: true }).selectOption("120");
  await page.getByLabel("Matched seeds", { exact: true }).selectOption("1");
  const previousExperiments = await (
    await page.request.get("/api/experiments")
  ).json();
  const previousId = previousExperiments[0]?.id;
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/experiments")).json())[0]?.id,
      { timeout: 60000 },
    )
    .not.toBe(previousId);
  await expect(
    page.getByRole("heading", { name: "Comparison results" }),
  ).toBeVisible({ timeout: 60000 });
  const measured = (
    await (await page.request.get("/api/experiments")).json()
  )[0];
  expect(measured.pairs[0].baseline.generated).toBe(
    measured.pairs[0].optimized.generated,
  );
  expect((await (await page.request.get("/api/snapshot")).json()).run_id).toBe(
    runId,
  );
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "End run", exact: true }).click();
  await page
    .getByRole("button", { name: "End and save run", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New run", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: `Open run ${runId}`, exact: true })
    .click();
  await expect(
    page.getByText("READ-ONLY PLAYBACK", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Telemetry CSV", exact: true }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toBe(`conveyor-${runId}.csv`);
  const csv = await (
    await page.request.get(`/api/runs/${runId}/telemetry.csv`)
  ).text();
  expect(csv).toContain("speed_m_s");
  expect(csv).toContain(runId);
  const browserArchive = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("conveyorlab:archives") || "[]"),
  );
  expect(
    browserArchive.some((r: { run_id: string }) => r.run_id === runId),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Operating limits", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("websocket resynchronization and idempotent commands", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.TEST_USERNAME || "acceptance-operator");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.TEST_PASSWORD || "acceptance-test-only-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Line overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const auth = await (await page.request.get("/api/auth/status")).json(),
    headers = { "x-csrf-token": auth.user.csrf };
  const snapshot = await (await page.request.get("/api/snapshot")).json();
  if (!["idle", "ended", "interrupted"].includes(snapshot.state))
    await page.request.post("/api/commands", {
      headers,
      data: { action: "end", values: {}, idempotency_key: crypto.randomUUID() },
    });
  const key = crypto.randomUUID(),
    body = {
      action: "new",
      values: { scenario: "balanced" },
      idempotency_key: key,
    };
  const a = await (
    await page.request.post("/api/commands", { headers, data: body })
  ).json();
  const b = await (
    await page.request.post("/api/commands", { headers, data: body })
  ).json();
  expect(a.status).toBe("applied");
  expect(a.id).toBe(b.id);
  await page.context().setOffline(true);
  await expect(page.getByText(/Live connection interrupted/)).toBeVisible({
    timeout: 15000,
  });
  await page.context().setOffline(false);
  await expect(page.getByText(/Live connection interrupted/)).not.toBeVisible({
    timeout: 20000,
  });
  expect(await page.getByTestId("sim-clock").textContent()).toBe("00:00:00");
});
