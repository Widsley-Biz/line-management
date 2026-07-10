import { db } from "@/lib/db";
import { ipTariffs, tenants } from "@/lib/db/schema";
import { eq, isNull, isNotNull } from "drizzle-orm";
import { DEFAULT_TARIFF } from "@/lib/ip-billing";
import { IpTariffsClient } from "./ip-tariffs-client";

export default async function IpTariffsPage() {
  const [defaultRow] = await db
    .select()
    .from(ipTariffs)
    .where(isNull(ipTariffs.tenantId))
    .limit(1);

  const overrides = await db
    .select({
      id: ipTariffs.id,
      tenantId: ipTariffs.tenantId,
      companyName: tenants.companyName,
      fixedRate: ipTariffs.fixedRate,
      mobileRate: ipTariffs.mobileRate,
      naviSecRate: ipTariffs.naviSecRate,
      naviAmountRate: ipTariffs.naviAmountRate,
      updatedAt: ipTariffs.updatedAt,
    })
    .from(ipTariffs)
    .innerJoin(tenants, eq(ipTariffs.tenantId, tenants.id))
    .where(isNotNull(ipTariffs.tenantId))
    .orderBy(tenants.companyName);

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.companyName);

  const defaultTariff = defaultRow ?? { ...DEFAULT_TARIFF };

  return (
    <IpTariffsClient
      defaultTariff={{
        fixedRate: defaultTariff.fixedRate,
        mobileRate: defaultTariff.mobileRate,
        naviSecRate: defaultTariff.naviSecRate,
        naviAmountRate: defaultTariff.naviAmountRate,
      }}
      overrides={overrides.map((o) => ({
        tenantId: o.tenantId!,
        companyName: o.companyName,
        fixedRate: o.fixedRate,
        mobileRate: o.mobileRate,
        naviSecRate: o.naviSecRate,
        naviAmountRate: o.naviAmountRate,
      }))}
      tenants={allTenants}
    />
  );
}
