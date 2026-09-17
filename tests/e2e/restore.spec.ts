import { expect, test, type Page } from "@playwright/test";
import type { CloudSchoolCollected } from "../../src/core/bridge";

/**
 * Cloud-School 교사 화면(과제 수집)과의 collect/restore 프로토콜 — docs/cloudschool-protocol.md.
 * 교사 쪽은 같은 index.html을 iframe으로 열고 postMessage로 학생 제출물을 밀어 넣는다. 여기서는 그 부모 페이지를
 * page.route로 흉내 낸다(`/teacher/`). 학생 쪽 수집은 window.CloudSchoolApp.collect()를 직접 부른다.
 */

// 1×1 흰색 PNG (codex.spec.ts와 같은 사진 픽스처)
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const EVIDENCE = process.env["EVIDENCE_DIR"];

/** 교사 화면 시뮬레이션: 메시지를 전부 기록하고, iframe으로 보내는 도우미를 둔다. */
const TEACHER_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>과제 수집 (테스트 하네스)</title>
<style>html,body{margin:0;height:100%;background:#0f172a}iframe{border:0;width:100%;height:100%;display:block}</style>
<script>
  window.__msgs = [];
  window.addEventListener("message", (e) => { window.__msgs.push(e.data); });
  window.__send = (m) => document.getElementById("app").contentWindow.postMessage(m, "*");
</script></head>
<body><iframe id="app" src="/"></iframe></body></html>`;

type TeacherWindow = Window & { __msgs: Array<{ type: string } & Record<string, unknown>>; __send: (m: unknown) => void };

async function unlockTwo(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator(".era")).toHaveCount(5);
  await page.fill("#studentLabel", "12");
  await page.locator("#studentLabel").blur();

  await page.locator('[data-treasure="art_01"] [data-action="keyword"]').click();
  await page.fill("#keywordInput", "신석기");
  await page.fill("#noteInput", "정착 생활의 시작");
  await page.click("#keywordSubmit");
  await expect(page.locator('[data-treasure="art_01"]')).toHaveAttribute("data-state", "unlocked");

  await page.locator('[data-treasure="art_07"] [data-action="photo"]').click();
  await page.setInputFiles("#photoInput", { name: "geumgwan.png", mimeType: "image/png", buffer: PNG_1x1 });
  await expect(page.locator("#photoPreview")).toBeVisible();
  await page.fill("#noteInput", "금관이 화려하다");
  await page.click("#photoSubmit");
  await expect(page.locator('[data-treasure="art_07"]')).toHaveAttribute("data-state", "unlocked");
  await expect(page.locator("#progressText")).toHaveText("2 / 20 (10%)");
}

function collect(page: Page): Promise<CloudSchoolCollected> {
  return page.evaluate(() => window.CloudSchoolApp!.collect());
}

test.describe("Cloud-School 과제 수집 프로토콜 (collect / restore)", () => {
  test("AC-1: window.CloudSchoolApp.collect()가 해금 2건과 사진 첨부 1장을 JPEG data URL로 돌려준다", async ({ page }) => {
    await unlockTwo(page);

    const api = await page.evaluate(() => {
      const a = window.CloudSchoolApp!;
      return { version: a.version, appId: a.appId, title: a.title, fns: [typeof a.collect, typeof a.restore, typeof a.clearRestore] };
    });
    expect(api).toEqual({ version: 1, appId: "treasure-codex", title: "역사 보물도감", fns: ["function", "function", "function"] });

    const c = await collect(page);
    expect(c).toMatchObject({ schema: 1, appId: "treasure-codex", studentLabel: "12", summary: { unlocked: 2, total: 20 } });
    expect(c.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(c.items.map((i) => [i.id, i.mode, i.note])).toEqual([
      ["art_01", "keyword", "정착 생활의 시작"],
      ["art_07", "photo", "금관이 화려하다"],
    ]);
    expect(c.attachments).toHaveLength(1);
    expect(c.attachments[0]).toMatchObject({ id: "photo-art_07", mimeType: "image/jpeg" });
    expect(c.attachments[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(c.document).toMatchObject({ title: "역사 보물도감" });
    expect(c.document?.printedAt).toBe(c.submittedAt);

    // 두 번 수집해도 같은 내용(시각만 다를 수 있다)
    const again = await collect(page);
    expect(again.items).toEqual(c.items);
    expect(again.attachments).toEqual(c.attachments);
  });

  test("AC-2: 교사 화면(iframe 부모)이 postMessage로 학생 제출물을 밀어 넣으면 읽기 전용으로 그려지고, 지우면 빈 도감으로 돌아간다", async ({ page, browser }) => {
    await unlockTwo(page);
    const payload = await collect(page);

    // 빈 IndexedDB의 새 컨텍스트 = 교사 PC
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const teacher = await ctx.newPage();
    const pageErrors: string[] = [];
    teacher.on("pageerror", (e) => pageErrors.push(String(e)));
    await teacher.route("**/teacher/", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: TEACHER_HTML }));
    await teacher.goto("/teacher/");

    // 부팅 신호
    await teacher.waitForFunction(() => (window as unknown as TeacherWindow).__msgs.some((m) => m.type === "cloudschool_app_ready"));
    const ready = await teacher.evaluate(() => (window as unknown as TeacherWindow).__msgs.find((m) => m.type === "cloudschool_app_ready"));
    expect(ready).toEqual({ type: "cloudschool_app_ready", appId: "treasure-codex", title: "역사 보물도감", version: 1 });

    const frame = teacher.frameLocator("iframe#app");
    await expect(frame.locator(".era")).toHaveCount(5);
    await expect(frame.locator("#progressText")).toHaveText("0 / 20 (0%)");
    await expect(frame.locator("#restoreBanner")).toHaveCount(0);

    // 학생 선택 → restore
    await teacher.evaluate((p) => (window as unknown as TeacherWindow).__send({ type: "cloudschool_restore", payload: p, studentName: "12번" }), payload);
    await teacher.waitForFunction(() => (window as unknown as TeacherWindow).__msgs.some((m) => m.type === "cloudschool_restored"));
    const restored = await teacher.evaluate(() => (window as unknown as TeacherWindow).__msgs.find((m) => m.type === "cloudschool_restored"));
    expect(restored).toEqual({ type: "cloudschool_restored", appId: "treasure-codex", studentLabel: "12", unlocked: 2, total: 20 });

    const banner = frame.locator("#restoreBanner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("12번 학생의 제출물 보기 (읽기 전용)");
    await expect(banner).toContainText("제출 ");
    await expect(banner.locator("i.fi.fi-rr-eye")).toHaveCount(1);
    await expect(banner.locator("#btn-clear-restore")).toHaveCount(0); // 내장 상태에서는 교사 UI가 전환을 맡는다
    await expect(frame.locator("#app")).toHaveAttribute("data-readonly", "true");
    await expect(frame.locator("#studentLabel")).toHaveValue("12");
    await expect(frame.locator("#studentLabel")).toHaveAttribute("readonly", "");
    await expect(frame.locator('[data-treasure="art_01"]')).toHaveAttribute("data-state", "unlocked");
    await expect(frame.locator('[data-treasure="art_01"]')).toHaveAttribute("data-mode", "keyword");
    await expect(frame.locator('[data-treasure="art_01"] [data-role="note"]')).toHaveText("정착 생활의 시작");
    await expect(frame.locator('[data-treasure="art_07"]')).toHaveAttribute("data-state", "unlocked");
    await expect(frame.locator('[data-treasure="art_07"] img.card-image')).toHaveAttribute("src", /^blob:/);
    await expect(frame.locator('[data-treasure="art_02"]')).toHaveAttribute("data-state", "locked");
    await expect(frame.locator("#progressText")).toHaveText("2 / 20 (10%)");
    await expect(frame.locator('[data-action="keyword"], [data-action="photo"]')).toHaveCount(0);
    for (const id of ["#btn-submit", "#btn-export", "#btn-import", "#btn-reset"]) await expect(frame.locator(id)).toHaveCount(0);
    await expect(frame.locator("#btn-print")).toBeVisible();

    if (EVIDENCE) await teacher.screenshot({ path: `${EVIDENCE}/restore-1366x768.png` });

    // 상세 모달: 소감·사진이 보이고 사진 변경 버튼은 없다
    await frame.locator('[data-treasure="art_07"] [data-action="detail"]').click();
    await expect(frame.locator('[data-role="detail-note"]')).toHaveText("금관이 화려하다");
    await expect(frame.locator("img.detail-image")).toHaveAttribute("src", /^blob:/);
    await expect(frame.locator(".modal-foot button")).toHaveCount(1);
    await frame.locator(".modal-foot button").click();
    await expect(frame.locator(".modal-panel")).toHaveCount(0);

    // 재생 중 collect는 그려 놓은 payload를 돌려준다 (멱등)
    await teacher.evaluate(() => (window as unknown as TeacherWindow).__send({ type: "cloudschool_collect", requestId: "r-1" }));
    await teacher.waitForFunction(() => (window as unknown as TeacherWindow).__msgs.some((m) => m.type === "cloudschool_collected"));
    const collected = (await teacher.evaluate(() => (window as unknown as TeacherWindow).__msgs.find((m) => m.type === "cloudschool_collected"))) as unknown as { requestId: string; payload: CloudSchoolCollected };
    expect(collected.requestId).toBe("r-1");
    expect(collected.payload.items).toEqual(payload.items);
    expect(collected.payload.attachments.map((a) => a.id)).toEqual(["photo-art_07"]);

    // 인쇄: no-print 숨김, 해금 카드는 그대로 (학생 도감을 그대로 출력할 수 있다)
    await teacher.emulateMedia({ media: "print" });
    const appFrame = teacher.frames().find((f) => f !== teacher.mainFrame())!;
    const printState = await appFrame.evaluate(() => ({
      hiddenNoPrint: Array.from(document.querySelectorAll(".no-print")).every((el) => getComputedStyle(el).display === "none"),
      unlockedShown: Array.from(document.querySelectorAll(".card-unlocked")).every((el) => getComputedStyle(el).display !== "none"),
      unlockedCount: document.querySelectorAll(".card-unlocked").length,
    }));
    expect(printState).toEqual({ hiddenNoPrint: true, unlockedShown: true, unlockedCount: 2 });
    await teacher.emulateMedia({ media: "screen" });

    // 지우기 → 이 기기의 실제(빈) 상태로
    await teacher.evaluate(() => (window as unknown as TeacherWindow).__send({ type: "cloudschool_clear_restore" }));
    await teacher.waitForFunction(() => (window as unknown as TeacherWindow).__msgs.some((m) => m.type === "cloudschool_restore_cleared"));
    await expect(frame.locator("#restoreBanner")).toHaveCount(0);
    await expect(frame.locator("#app")).not.toHaveAttribute("data-readonly", "true");
    await expect(frame.locator('[data-treasure="art_01"]')).toHaveAttribute("data-state", "locked");
    await expect(frame.locator('[data-treasure="art_07"]')).toHaveAttribute("data-state", "locked");
    await expect(frame.locator("#progressText")).toHaveText("0 / 20 (0%)");
    await expect(frame.locator('[data-treasure="art_01"] [data-action="keyword"]')).toBeVisible();

    // IndexedDB에는 아무것도 쓰이지 않았다: live collect가 0건, 새로고침해도 0건
    const live = await appFrame.evaluate(() => window.CloudSchoolApp!.collect());
    expect(live.items).toEqual([]);
    expect(live.attachments).toEqual([]);
    expect(live.studentLabel).toBe("");
    await teacher.reload();
    await expect(teacher.frameLocator("iframe#app").locator("#progressText")).toHaveText("0 / 20 (0%)");

    // 모르는 타입·깨진 payload는 무시된다 (응답 없음, 페이지 오류 없음)
    await teacher.evaluate(() => {
      const w = window as unknown as TeacherWindow;
      w.__msgs.length = 0;
      w.__send({ type: "cloudschool_restore", payload: { schema: 1, appId: "other", items: [] } });
      w.__send({ type: "eval", code: "1+1" });
      w.__send("문자열");
    });
    await teacher.waitForTimeout(500);
    expect(await teacher.evaluate(() => (window as unknown as TeacherWindow).__msgs.filter((m) => typeof m?.type === "string" && m.type.startsWith("cloudschool_")))).toEqual([]);
    await expect(teacher.frameLocator("iframe#app").locator("#restoreBanner")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await ctx.close();
  });

  test("AC-3: #restore로 열면 3초 뒤 안내가 뜨고, 보통 페이지에는 배너·안내가 없다", async ({ page }) => {
    await page.goto("./#restore");
    await expect(page.locator(".era")).toHaveCount(5);
    await expect(page.locator("#restoreHint")).toHaveCount(0);
    await expect(page.locator("#restoreHint")).toBeVisible({ timeout: 6_000 });
    await expect(page.locator("#restoreHint")).toHaveText("선생님 화면에서 학생을 선택하세요");
    // 안내는 비차단: 도감은 그대로 쓸 수 있다
    await expect(page.locator('[data-treasure="art_01"] [data-action="keyword"]')).toBeVisible();
    await expect(page.locator("#app")).not.toHaveAttribute("data-readonly", "true");

    await page.goto("./");
    await expect(page.locator(".era")).toHaveCount(5);
    await page.waitForTimeout(3_500);
    await expect(page.locator("#restoreBanner")).toHaveCount(0);
    await expect(page.locator("#restoreHint")).toHaveCount(0);
    await expect(page.locator("#app")).not.toHaveAttribute("data-readonly", "true");
  });
});
