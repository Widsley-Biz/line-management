import { db } from "@/lib/db";
import { ipNumbers, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { IpMasterClient } from "./ip-master-client";

export default async function IpMasterPage() {
  const numbers = await db
    .select({
      id: ipNumbers.id,
      phoneNumber: ipNumbers.phoneNumber,
      subNumber: ipNumbers.subNumber,
      status: ipNumbers.status,
      notes: ipNumbers.notes,
      tenantId: ipNumbers.tenantId,
      companyName: tenants.companyName,
    })
    .from(ipNumbers)
    .innerJoin(tenants, eq(ipNumbers.tenantId, tenants.id))
    .orderBy(tenants.companyName);

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.companyName);

  return <IpMasterClient numbers={numbers} tenants={allTenants} />;
}
