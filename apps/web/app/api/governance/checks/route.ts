import { NextResponse } from "next/server";
import { getStore, runGovernanceChecks } from "@specforge/core";

export async function GET() {
  const store = getStore();
  const targets = [
    ...store.apis.map((asset) => ({ type: "api", id: asset.id })),
    ...store.events.map((asset) => ({ type: "event", id: asset.id })),
    ...store.dataModels.map((asset) => ({ type: "dataModel", id: asset.id })),
    ...store.businessRules.map((asset) => ({ type: "businessRule", id: asset.id })),
    ...store.proposals.map((asset) => ({ type: "proposal", id: asset.id }))
  ];
  return NextResponse.json((await Promise.all(targets.map((target) => runGovernanceChecks(target.type, target.id)))).flat());
}
