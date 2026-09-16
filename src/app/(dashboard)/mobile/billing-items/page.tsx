import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManageBilling } from "@/lib/roles";
import { BillingItemsClient } from "./billing-items-client";

export default async function BillingItemsPage() {
  const session = await auth();
  // 課金項目マスタは請求額の土台になるため admin / leader のみ
  if (!canManageBilling(session?.user?.role)) redirect("/");

  return <BillingItemsClient />;
}
