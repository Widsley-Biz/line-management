import { db } from "@/lib/db";
import { mobileImportUnmatched, tenants } from "@/lib/db/schema";
import { ne } from "drizzle-orm";
import { UnmatchedClient } from "./unmatched-client";

export default async function UnmatchedPage() {
  const [rows, allTenants] = await Promise.all([
    db
      .select()
      .from(mobileImportUnmatched)
      .where(ne(mobileImportUnmatched.status, "resolved"))
      .orderBy(mobileImportUnmatched.yearMonth, mobileImportUnmatched.rawName),
    db
      .select({ id: tenants.id, companyName: tenants.companyName })
      .from(tenants)
      .orderBy(tenants.companyName),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">未照合一覧</h1>
        <p className="text-sm text-gray-500 mt-1">
          SoftBank CSV取込時に取引先と一致しなかった行。取引先を割り当てるか無視してください。
        </p>
      </div>
      <UnmatchedClient rows={rows} tenants={allTenants} />
    </div>
  );
}
