import { expect, test } from "@playwright/test";

test("production 빌드가 열리고 아이콘 폰트가 로드된다", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle("역사 보물도감");
  await expect(page.getByRole("heading", { level: 1, name: "역사 보물도감" })).toBeVisible();

  // fi fi-rr 아이콘 폰트가 실제로 적용됐는지 (CDN 없이, 번들 안의 woff2에서)
  const fontFamily = await page.locator("i.fi").first().evaluate((el) => getComputedStyle(el, "::before").fontFamily);
  expect(fontFamily.toLowerCase()).toContain("uicons-regular-rounded");

  // 외부 CDN 요청이 하나도 없어야 한다 (교실 Wi-Fi가 끊겨도 동작)
  const external: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") external.push(req.url());
  });
  await page.reload();
  expect(external).toEqual([]);

  // 증거 디렉터리가 지정되면 크롬북 해상도 캡처를 남긴다 (브랜드 자산 게이트의 screenshot).
  const evidenceDir = process.env["EVIDENCE_DIR"];
  if (evidenceDir) {
    await page.screenshot({ path: `${evidenceDir}/screenshot-chromebook-1366x768.png`, fullPage: true });
  }
});
