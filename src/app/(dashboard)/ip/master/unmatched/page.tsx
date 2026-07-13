import { db } from "@/lib/db";
import { ipMasterUnmatched, tenants } from "@/lib/db/schema";
import { ne, eq } from "drizzle-orm";
import { MasterUnmatchedClient } from "./master-unmatched-client";

export default async function IpMasterUnmatchedPage() {
  const [rows, allTenants] = await Promise.all([
    db
      .select()
      .from(ipMasterUnmatched)
      .where(ne(ipMasterUnmatched.status, "resolved"))
      .orderBy(ipMasterUnmatched.phoneNumber),
    db
      .select({ id: tenants.id, companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.status, "active"))
      .orderBy(tenants.companyName),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">番号マスタ未照合一覧</h1>
        <p className="text-sm text-gray-500 mt-1">
          番号マスタCSV一括登録時に取引先(会社名・tenantスラッグ)が一致しなかった番号。取引先を割り当てるか無視してください。割当時は番号マスタに登録されます。
        </p>
      </div>
      <MasterUnmatchedClient rows={rows} tenants={allTenants} />
    </div>
  );
}
