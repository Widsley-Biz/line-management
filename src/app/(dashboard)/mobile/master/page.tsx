import { db } from "@/lib/db";
import { mobileLines, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MobileMasterClient } from "./mobile-master-client";

export default async function MobileMasterPage() {
  const lines = await db
    .select({
      id: mobileLines.id,
      phoneNumber: mobileLines.phoneNumber,
      status: mobileLines.status,
      contractStart: mobileLines.contractStart,
      contractEnd: mobileLines.contractEnd,
      deviceReturned: mobileLines.deviceReturned,
      notes: mobileLines.notes,
      tenantId: mobileLines.tenantId,
      companyName: tenants.companyName,
    })
    .from(mobileLines)
    .innerJoin(tenants, eq(mobileLines.tenantId, tenants.id))
    .orderBy(tenants.companyName);

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.companyName);

  return <MobileMasterClient lines={lines} tenants={allTenants} />;
}