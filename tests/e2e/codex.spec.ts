import { expect, test, type Page } from "@playwright/test";

// 1×1 흰색 PNG (사진 등록용 최소 픽스처)
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const EVIDENCE = process.env["EVIDENCE_DIR"];

async function shot(page: Page, name: string, viewport: { width: number; height: number }) {
  if (!EVIDENCE) return;
  await page.setViewportSize(viewport);
  await page.screenshot({ path: `${EVIDENCE}/${name}-${viewport.width}x${viewport.height}.png`, fullPage: true });
}

test.describe("보물도감 화면", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".era")).toHaveCount(5);
  });

  test("핵심어 입력으로 해금되고 오답은 거부된다 (AC-1)", async ({ page }) => {
    const card = page.locator('[data-treasure="art_01"]');
    await expect(card).toHaveAttribute("data-state", "locked");
    await card.locator('[data-action="keyword"]').click();

    await page.fill("#keywordInput", "고인돌");
    await page.click("#keywordSubmit");
    await expect(page.locator("#keywordError")).toContainText("맞지 않아요");
    await expect(card).toHaveAttribute("data-state", "locked");

    await page.fill("#keywordInput", " 빗살 무늬 토기 ");
    await page.fill("#noteInput", "정착 생활의 시작");
    await page.press("#keywordInput", "Enter");

    await expect(card).toHaveAttribute("data-state", "unlocked");
    await expect(card).toHaveAttribute("data-mode", "keyword");
    await expect(card).toHaveClass(/card-just-unlocked/);
    await expect(card.locator('[data-role="note"]')).toHaveText("정착 생활의 시작");
    await expect(page.locator("#progressText")).toHaveText("1 / 20 (5%)");
  });

  test("사진 등록으로 해금되고 새로고침 후에도 유지된다 (AC-2)", async ({ page }) => {
    const card = page.locator('[data-treasure="art_07"]');
    await card.locator('[data-action="photo"]').click();
    await page.setInputFiles("#photoInput", { name: "geumgwan.png", mimeType: "image/png", buffer: PNG_1x1 });
    await expect(page.locator("#photoPreview")).toBeVisible();
    await page.fill("#noteInput", "금관이 화려하다");
    await page.click("#photoSubmit");
    await expect(card).toHaveAttribute("data-state", "unlocked");
    await expect(card).toHaveAttribute("data-mode", "photo");
    await expect(card.locator("img.card-image")).toBeVisible();

    await page.reload();
    const again = page.locator('[data-treasure="art_07"]');
    await expect(again).toHaveAttribute("data-state", "unlocked");
    await expect(again.locator("img.card-image")).toHaveAttribute("src", /^blob:/);

    // 상세 보기에 사진·설명·소감이 보인다
    await again.locator('[data-action="detail"]').click();
    await expect(page.locator("img.detail-image")).toBeVisible();
    await expect(page.locator('[data-role="detail-note"]')).toHaveText("금관이 화려하다");
  });

  test("아이콘은 전부 fi fi-rr이며 FontAwesome·이모지·인라인 SVG 아이콘이 없다 (AC-3)", async ({ page }) => {
    // 모달까지 포함해 검사
    await page.locator('[data-treasure="art_02"] [data-action="keyword"]').click();
    const audit = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("i, svg, .fa, .fa-solid, [class*='fa-']"));
      const bad = all.filter((el) => {
        if (el.tagName.toLowerCase() === "svg") return true;
        const cls = el.getAttribute("class") ?? "";
        return !(/(^|\s)fi(\s|$)/.test(cls) && /fi-rr-[a-z0-9-]+/.test(cls));
      });
      const text = document.body.textContent ?? "";
      const emoji = text.match(/\p{Extended_Pictographic}/gu) ?? [];
      const fiCount = all.filter((el) => /fi-rr-/.test(el.getAttribute("class") ?? "")).length;
      return { bad: bad.map((b) => b.outerHTML.slice(0, 80)), emoji, fiCount };
    });
    expect(audit.bad).toEqual([]);
    expect(audit.emoji).toEqual([]);
    expect(audit.fiCount).toBeGreaterThan(20);
  });

  test("학생 소감은 HTML로 해석되지 않는다 (AC-4)", async ({ page }) => {
    const payload = '<img src=x onerror="window.__xss=1"><b>굵게</b>';
    await page.locator('[data-treasure="art_03"] [data-action="keyword"]').click();
    await page.fill("#keywordInput", "고조선");
    await page.fill("#noteInput", payload);
    await page.click("#keywordSubmit");
    const card = page.locator('[data-treasure="art_03"]');
    await expect(card).toHaveAttribute("data-state", "unlocked");
    await expect(card.locator('[data-role="note"]')).toHaveText(payload);
    expect(await card.locator('[data-role="note"] img, [data-role="note"] b').count()).toBe(0);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("크롬북·데스크톱·모바일 뷰포트 스크린샷과 인쇄 레이아웃 (AC-5, AC-6)", async ({ page }) => {
    // 해금 하나 있는 상태로 캡처
    await page.locator('[data-treasure="art_01"] [data-action="keyword"]').click();
    await page.fill("#keywordInput", "신석기");
    await page.click("#keywordSubmit");
    await expect(page.locator('[data-treasure="art_01"]')).toHaveAttribute("data-state", "unlocked");

    await shot(page, "codex", { width: 1280, height: 800 });
    await shot(page, "codex", { width: 1366, height: 768 });
    await shot(page, "codex", { width: 375, height: 812 });
    await page.setViewportSize({ width: 1366, height: 768 });

    // 인쇄: no-print 숨김, 접힌 시대도 펼침
    await page.click("text=모두 접기");
    await expect(page.locator(".era-content").first()).toBeHidden();
    await page.emulateMedia({ media: "print" });
    const printState = await page.evaluate(() => ({
      hiddenNoPrint: Array.from(document.querySelectorAll(".no-print")).every((el) => getComputedStyle(el).display === "none"),
      eraContentShown: Array.from(document.querySelectorAll(".era-content")).every((el) => getComputedStyle(el).display !== "none"),
    }));
    expect(printState.hiddenNoPrint).toBe(true);
    expect(printState.eraContentShown).toBe(true);
    if (EVIDENCE) await page.screenshot({ path: `${EVIDENCE}/codex-print-preview.png`, fullPage: true });
    await page.emulateMedia({ media: "screen" });
  });

  test("초기화하면 모든 기록이 사라진다", async ({ page }) => {
    await page.locator('[data-treasure="art_01"] [data-action="keyword"]').click();
    await page.fill("#keywordInput", "신석기");
    await page.click("#keywordSubmit");
    await expect(page.locator("#progressText")).toHaveText("1 / 20 (5%)");
    await page.click("#btn-reset");
    await page.click("#confirm-yes");
    await expect(page.locator("#progressText")).toHaveText("0 / 20 (0%)");
    await page.reload();
    await expect(page.locator("#progressText")).toHaveText("0 / 20 (0%)");
  });
});
