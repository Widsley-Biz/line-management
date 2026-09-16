/**
 * 動作確認用のダミーのコンシェル。開発環境でのみ表示する。
 *
 * 実サイトがなくても concierge-bot を通しで動かせるようにするためのもの。
 * 本番では 404 になる。
 */
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

export default async function MockLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  // ?scenario= を一覧まで引き継ぐ。差分の出方を試し分けるため
  const { scenario } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const password = formData.get("password") as string;
    const sc = (formData.get("scenario") as string) || "";
    if (!id || !password) redirect("/mock-concierge/login?error=1");
    redirect(`/mock-concierge/lines${sc ? `?scenario=${sc}` : ""}`);
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>【ダミー】SB法人コンシェル</h1>
      <p>動作確認用。実サイトではありません。</p>
      <form action={signIn} style={{ display: "grid", gap: 12, maxWidth: 320 }}>
        <input type="hidden" name="scenario" value={scenario ?? ""} />
        <label>
          ID
          <input name="id" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          パスワード
          <input name="password" type="password" style={{ display: "block", width: "100%" }} />
        </label>
        <button type="submit">ログイン</button>
      </form>
    </div>
  );
}
