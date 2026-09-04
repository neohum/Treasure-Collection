/**
 * 허브 감지. all_market 교실 허브는 번들을 `{origin}/dist/{toolID}/…`로 서빙한다.
 * 그 경로에서 열렸을 때만 [전송]이 POST로 동작하고, 그 밖(GitHub Pages, 로컬 preview)에서는
 * JSON 내보내기로 대체된다. toolID 패턴은 all_market 매니페스트 규칙(`^[a-z0-9-]+$`)과 같다.
 */
export interface HubContext {
  hubOrigin: string;
  toolId: string;
}

const DIST_PATTERN = /^\/dist\/([a-z0-9-]+)\/(?:.*)?$/;

export function detectHub(location: { origin: string; pathname: string }): HubContext | null {
  const match = DIST_PATTERN.exec(location.pathname);
  if (!match || !match[1]) return null;
  return { hubOrigin: location.origin, toolId: match[1] };
}

export function submissionsUrl(ctx: HubContext): string {
  return `${ctx.hubOrigin}/api/tools/${ctx.toolId}/submissions`;
}
