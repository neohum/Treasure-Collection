import { expect, test } from "@playwright/test";

test.describe("PWA Service Worker & Offline Capability", () => {
  test("서비스 워커가 등록되고 오프라인 상태에서도 새로고침 시 도감이 정상 렌더링된다", async ({ page, context }) => {
    await page.goto("./");
    await expect(page).toHaveTitle("역사 보물도감");

    // 1. 매니페스트 링크 태그 확인
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute("href", "./pwa.json");

    // 2. 서비스 워커 등록 대기
    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg;
    });
    expect(swRegistered).toBe(true);

    // 3. 오프라인 모드 전환 후 새로고침
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#app")).toBeVisible();
      await expect(page.locator(".era")).toHaveCount(5);
      await expect(page.getByRole("heading", { level: 1, name: "역사 보물도감" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("pwa.json 메타데이터와 아이콘 설정이 유효하다", async ({ page }) => {
    const res = await page.request.get("./pwa.json");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe("역사 보물도감");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.some((i: { src: string }) => i.src.includes("icon-192"))).toBe(true);
    expect(manifest.icons.some((i: { src: string }) => i.src.includes("icon-512"))).toBe(true);
  });
});
