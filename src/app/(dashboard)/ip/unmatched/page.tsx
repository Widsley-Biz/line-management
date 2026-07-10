import { db } from "@/lib/db";
import { ipImportUnmatched, tenants } from "@/lib/db/schema";
import { ne, eq } from "drizzle-orm";
import { UnmatchedClient } from "./unmatched-client";

export default async function IpUnmatchedPage() {
  const [rows, allTenants] = await Promise.all([
    db
      .select()
      .from(ipImportUnmatched)
      .where(ne(ipImportUnmatched.status, "resolved"))
      .orderBy(ipImportUnmatched.yearMonth, ipImportUnmatched.phoneNumber),
    db
      .select({ id: tenants.id, companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.status, "active"))
      .orderBy(tenants.companyName),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">未照合一覧</h1>
        <p className="text-sm text-gray-500 mt-1">
          CDR取込時に番号マスタ（表番号・裏番号）と一致しなかった番号。取引先を割り当てるか無視してください。割当時は番号マスタにも自動登録されます。
        </p>
      </div>
      <UnmatchedClient rows={rows} tenants={allTenants} />
    </div>
  );
}
