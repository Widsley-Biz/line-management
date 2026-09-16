import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { landingPathFor } from "@/lib/roles";

// ロールごとの入口へ振り分ける。
// admin / leader はダッシュボード、member / viewer は取引先一覧。
export default async function RootPage() {
  const session = await auth();
  redirect(landingPathFor(session?.user?.role));
}
