import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO_PASSWORD = "fieldnote-demo-2026";
const REPORT = "The hallway light near room 204 keeps flickering and smells burnt.";

async function signIn(browser: Browser, email: string, password = DEMO_PASSWORD): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  return page;
}

test.describe.configure({ mode: "serial" });

let workOrderPath = "";

test("reporter files a note, reviews the rule-based draft and sends it to triage", async ({ browser }) => {
  const page = await signIn(browser, "jordan@northgate.test");
  await page.goto("/app/work-orders/new");
  await page.getByLabel("Describe the issue").fill(REPORT);
  await page.getByLabel("Location (optional)").fill("Level 2 hallway");
  await page.getByRole("button", { name: "Draft structure from note" }).click();

  // AI is disabled in this environment, so the draft must say it is rule-based.
  await expect(page.getByText("Rule-based draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Rule-based draft (no AI model used)")).toBeVisible();
  const safety = page.getByRole("checkbox", { name: /Possible safety risk/ });
  await expect(safety).toBeChecked();
  await expect(page.getByText("from “smells burnt”").first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Getting worse over time/ })).toBeChecked();

  await page.getByLabel(/^Title/).fill("Flickering hallway light near room 204, burning smell");
  await page.getByRole("button", { name: "Send to triage" }).click();
  await expect(page.getByText(/is with the coordinators/)).toBeVisible();
  await expect(page.getByText("Triage", { exact: true }).first()).toBeVisible();
  workOrderPath = new URL(page.url()).pathname;
  expect(workOrderPath).toMatch(/^\/app\/work-orders\/\w+$/);
});

test("a different reporter cannot open it by URL", async ({ browser }) => {
  const page = await signIn(browser, "sam@northgate.test");
  await page.goto(workOrderPath);
  await expect(page.getByText("You can’t open this with your current access.")).toBeVisible();
  await expect(page.getByText(REPORT)).toHaveCount(0);
});

test("coordinator confirms priority, assigns a technician and marks it ready", async ({ browser }) => {
  const page = await signIn(browser, "priya@northgate.test");
  await page.goto(workOrderPath);
  await expect(page.getByText("Urgent: possible safety risk reported and the issue is getting worse.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm priority" }).click();
  await expect(page.getByText(/^Confirmed /)).toBeVisible();

  await page.getByLabel("Owner").selectOption({ label: "Tomás Ferreira" });
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Owner updated.")).toBeVisible();

  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
});

test("technician starts, records progress and resolves with a note", async ({ browser }) => {
  const page = await signIn(browser, "tomas@northgate.test");
  await page.goto(workOrderPath);
  await page.getByRole("button", { name: "Start work" }).click();
  await expect(page.getByRole("button", { name: "Resolve" })).toBeVisible();

  await page.getByLabel("Add a note").fill("Ballast is scorched. Isolated the circuit at the level 2 board.");
  await page.getByRole("button", { name: "Post note" }).click();
  await expect(page.getByText("Note added to the timeline.")).toBeVisible();

  await page.getByRole("button", { name: "Resolve" }).click();
  const dialog = page.getByRole("dialog", { name: "Resolve this work" });
  await dialog.getByRole("button", { name: "Resolve" }).click();
  // The server rejects a resolution without a note; the dialog stays open with its message.
  await expect(dialog.getByText("Add a resolution note before closing this work.")).toBeVisible();
  await dialog.getByLabel("Resolution note").fill("Replaced the ballast and lamp holder. No smell after 30 minutes.");
  await dialog.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("heading", { name: "Resolution" })).toBeVisible();
  await expect(page.getByText("In progress → Resolved")).toBeVisible();
});

test("reporter sees the resolution and the full timeline", async ({ browser }) => {
  const page = await signIn(browser, "jordan@northgate.test");
  await page.goto(workOrderPath);
  await expect(page.getByText("Replaced the ballast and lamp holder. No smell after 30 minutes.").first()).toBeVisible();
  for (const line of ["Submitted → Triage", "Triage → Ready", "Ready → In progress", "Assigned to Tomás Ferreira"]) {
    await expect(page.getByText(line)).toBeVisible();
  }
});
