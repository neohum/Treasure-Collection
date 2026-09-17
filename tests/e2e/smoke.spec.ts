import { expect, test } from "@playwright/test";

test.describe("config.json 로드 견고성 (cloud-school 뷰어 404 회귀)", () => {
  test("index.html이 번들과 다른 경로에서 열려도 스크립트 위치 기준으로 config.json을 찾는다", async ({ page, baseURL }) => {
    // 뷰어 시뮬레이션: /viewer/app 에서 index.html을 서빙하되 자산은 절대 URL로 가리킨다 → 페이지 기준 ./config.json은 404
    await page.route("**/viewer/app", async (route) => {
      const res = await route.fetch({ url: `${baseURL}/` });
      const html = (await res.text()).replace(/(src|href)="\.\//g, `$1="${baseURL}/`);
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    });
    await page.goto("/viewer/app");
    await expect(page.locator(".era")).toHaveCount(5);
    await expect(page.locator("#app")).toHaveAttribute("data-config-source", "file");
  });

  test("config.json이 어디에도 없어도 내장 설정으로 도감이 뜬다", async ({ page }) => {
    await page.route("**/config.json", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("./");
    await expect(page.locator(".era")).toHaveCount(5);
    await expect(page.locator("#app")).toHaveAttribute("data-config-source", "embedded");
    await expect(page.locator(".boot-error")).toHaveCount(0);
    // 내장 설정도 평문 핵심어 없이 해시만 담는다
    const leaked = await page.evaluate(async () => {
      const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
      const texts = await Promise.all(scripts.map((s) => fetch(s).then((r) => r.text())));
      return texts.some((t) => t.includes("빗살무늬 토기\"") && t.includes("keywordHashes") && /keywordHashes[^}]*빗살/.test(t));
    });
    expect(leaked).toBe(false);
  });
});

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
