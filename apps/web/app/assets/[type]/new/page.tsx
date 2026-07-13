import { redirect } from "next/navigation";
import type { AssetRouteType } from "../../../../lib/assets";
import { withSearchParams, type RouteSearchParams } from "../../../../lib/locale";

export default async function NewAssetPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType }>; searchParams: Promise<RouteSearchParams> }) {
  const { type } = await params;
  redirect(withSearchParams(`/assets/${type}`, await searchParams));
}
