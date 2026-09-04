import { expect, test, type Page } from "@playwright/test";

/**
 * 허브 시뮬레이션: preview 서버는 루트에서 번들을 서빙하지만, 허브는 /dist/treasure-codex/ 아래에서
 * 서빙한다. 그 경로로 오는 요청을 루트로 되돌려 주고, 전송 API는 route로 가로챈다.
 */
const HUB_PREFIX = "/dist/treasure-codex/";
const API = "**/api/tools/treasure-codex/submissions";

async function serveUnderHubPrefix(page: Page) {
  await page.route(`**${HUB_PREFIX}**`, async (route) => {
    const url = new URL(route.request().url());
    const rest = url.pathname.slice(HUB_PREFIX.length);
    const target = `${url.origin}/${rest}${url.search}`;
    const res = await route.fetch({ url: target });
    await route.fulfill({ response: res });
  });
}

async function unlockOne(page: Page, id: string, keyword: string, note = "") {
  await page.locator(`[data-treasure="${id}"] [data-action="keyword"]`).click();
  await page.fill("#keywordInput", keyword);
  if (note) await page.fill("#noteInput", note);
  await page.click("#keywordSubmit");
  await expect(page.locator(`[data-treasure="${id}"]`)).toHaveAttribute("data-state", "unlocked");
}

const EVIDENCE = process.env["EVIDENCE_DIR"];

test.describe("전송 버튼", () => {
  test("허브 경로에서 [전송]이 계약 본문을 POST하고 영수증을 보여 준다 (AC-1, AC-4)", async ({ page }) => {
    await serveUnderHubPrefix(page);
    const bodies: unknown[] = [];
    await page.route(API, async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ receiptId: "rcpt-0001", receivedAt: "2026-09-04T14:05:13+09:00" }) });
    });

    await page.goto(HUB_PREFIX);
    await expect(page.locator(".era")).toHaveCount(5);
    await expect(page.locator("#btn-submit")).toBeVisible();
    await expect(page.locator("#btn-export")).toHaveCount(0);

    await page.fill("#studentLabel", "12");
    await page.press("#studentLabel", "Enter");
    await page.locator("#studentLabel").blur();
    await unlockOne(page, "art_01", "신석기", "정착 생활의 시작");
    await unlockOne(page, "art_02", "고인돌");

    await page.click("#btn-submit");
    await expect(page.locator("#submitSend")).toBeEnabled();
    await page.click("#submitSend");
    await expect(page.locator('[data-role="receipt-id"]')).toHaveText("rcpt-0001");
    if (EVIDENCE) await page.screenshot({ path: `${EVIDENCE}/submit-receipt-1366x768.png` });

    expect(bodies).toHaveLength(1);
    const body = bodies[0] as Record<string, unknown>;
    expect(body).toMatchObject({ schema: 1, toolId: "treasure-codex", studentLabel: "12", summary: { unlocked: 2, total: 20 } });
    expect(body["submittedAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    const items = body["items"] as Array<Record<string, unknown>>;
    expect(items.map((i) => i["id"])).toEqual(["art_01", "art_02"]);
    expect(items[0]).toMatchObject({ mode: "keyword", note: "정착 생활의 시작" });
    // AC-4: 사진·IP·기기 관련 키가 어디에도 없다
    const json = JSON.stringify(body);
    for (const key of ["image", "imageBase64", "ip", "remoteAddr", "userAgent", "deviceName"]) expect(json).not.toContain(`"${key}"`);
    expect(json).not.toContain("data:image");
  });

  test("허브가 응답하지 못하면 큐에 남고 다음 [전송]에서 재시도된다 (AC-2)", async ({ page }) => {
    await serveUnderHubPrefix(page);
    let hubUp = false;
    const received: unknown[] = [];
    await page.route(API, async (route) => {
      if (!hubUp) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "hub down" }) });
      received.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ receiptId: `rcpt-${received.length}`, receivedAt: "2026-09-04T14:05:13+09:00" }) });
    });

    await page.goto(HUB_PREFIX);
    await page.fill("#studentLabel", "7");
    await page.locator("#studentLabel").blur();
    await unlockOne(page, "art_01", "신석기");

    await page.click("#btn-submit");
    await page.click("#submitSend");
    await expect(page.locator("#submitStatus")).toContainText("다음 [전송] 때 다시 보내요");
    await page.keyboard.press("Escape");
    await expect(page.locator("#pendingBadge")).toHaveText("아직 전송되지 않은 기록 1건");

    // 새로고침해도 큐는 남는다
    await page.reload();
    await expect(page.locator("#pendingBadge")).toHaveText("아직 전송되지 않은 기록 1건");

    hubUp = true;
    await unlockOne(page, "art_02", "고인돌");
    await page.click("#btn-submit");
    await page.click("#submitSend");
    await expect(page.locator('[data-role="receipt-id"]')).toHaveText("rcpt-2");
    await expect(page.locator("#submitReceipt")).toContainText("밀린 기록 1건도 함께 보냈어요");
    expect(received).toHaveLength(2);
    expect((received[0] as { summary: { unlocked: number } }).summary.unlocked).toBe(1);
    expect((received[1] as { summary: { unlocked: number } }).summary.unlocked).toBe(2);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pendingBadge")).toHaveCount(0);
  });

  test("허브 경로가 아니면 같은 자리의 버튼이 [내보내기]가 되고 JSON을 내려받는다 (AC-3)", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("#btn-submit")).toHaveCount(0);
    const exportBtn = page.locator("#btn-export");
    await expect(exportBtn).toContainText("내보내기");
    await page.fill("#studentLabel", "3");
    await page.locator("#studentLabel").blur();
    await unlockOne(page, "art_01", "신석기");

    const [download] = await Promise.all([page.waitForEvent("download"), exportBtn.click()]);
    expect(download.suggestedFilename()).toMatch(/^보물도감-3-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const text = await (await import("node:fs/promises")).readFile(path!, "utf8");
    const parsed = JSON.parse(text) as { schema: number; records: Array<{ id: string }> };
    expect(parsed.schema).toBe(1);
    expect(parsed.records.map((r) => r.id)).toEqual(["art_01"]);
  });

  test("번호가 비어 있으면 전송 버튼이 막히고 안내가 뜬다 (AC-5)", async ({ page }) => {
    await serveUnderHubPrefix(page);
    let posted = 0;
    await page.route(API, async (route) => { posted++; await route.fulfill({ status: 201, body: "{}" }); });
    await page.goto(HUB_PREFIX);
    await unlockOne(page, "art_01", "신석기");
    await page.click("#btn-submit");
    await expect(page.locator("#submitStatus")).toContainText("번호(또는 이름)를 먼저 입력하세요");
    await expect(page.locator("#submitSend")).toBeDisabled();
    expect(posted).toBe(0);
  });
});
