import "server-only";

/**
 * concierge-bot（Cloud Run Job）の起動。
 *
 * INV-1 により、Playwright は本体サービスとは別プロセスで動かし、
 * DBには一切触らせない。取得結果は HTTP で本体に返してもらう。
 * ここはその「起動だけ」を担当する。
 */

export type TriggerResult =
  | { ok: true; executionName: string }
  | { ok: false; error: string };

const JOB_NAME = process.env.CONCIERGE_JOB_NAME ?? "concierge-bot";
const JOB_REGION = process.env.CONCIERGE_JOB_REGION ?? "asia-northeast1";

/** Cloud Run 上なら metadata サーバーからプロジェクトIDとアクセストークンを取る */
async function metadata(path: string): Promise<string | null> {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/${path}`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string | null> {
  const raw = await metadata("instance/service-accounts/default/token");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Job を起動する。runId と callbackToken を環境変数の上書きで渡し、
 * ボットはそれを使って結果を返してくる。
 */
export async function triggerConciergeJob(params: {
  runId: string;
  callbackToken: string;
  callbackUrl: string;
}): Promise<TriggerResult> {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ??
    (await metadata("project/project-id")) ??
    null;

  if (!project) {
    return {
      ok: false,
      error:
        "プロジェクトIDを特定できません（ローカル実行では Job を起動できません）",
    };
  }

  const token = await accessToken();
  if (!token) {
    return { ok: false, error: "Cloud Run の認証トークンを取得できません" };
  }

  const url =
    `https://run.googleapis.com/v2/projects/${project}` +
    `/locations/${JOB_REGION}/jobs/${JOB_NAME}:run`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [
            {
              env: [
                { name: "RUN_ID", value: params.runId },
                { name: "CALLBACK_TOKEN", value: params.callbackToken },
                { name: "CALLBACK_URL", value: params.callbackUrl },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const body = (await res.json().catch(() => ({}))) as {
      name?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        error: body.error?.message ?? `Job の起動に失敗しました (HTTP ${res.status})`,
      };
    }

    return { ok: true, executionName: body.name ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Job の起動に失敗しました",
    };
  }
}
