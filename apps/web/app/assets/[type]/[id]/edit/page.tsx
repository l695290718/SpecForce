import { redirect } from "next/navigation";
import type { AssetRouteType } from "../../../../../lib/assets";
import { withSearchParams, type RouteSearchParams } from "../../../../../lib/locale";

export default async function EditAssetPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType; id: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { type, id } = await params;
  redirect(withSearchParams(`/assets/${type}/${id}`, await searchParams));
}
