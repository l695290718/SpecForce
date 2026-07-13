import { PageHeader } from "../../../../../components/ui";
import { AssetDraftForm } from "../../../../../components/asset-draft-form";
import { assetTitleKeys, getRouteAssetWithDatabase, routeToAssetType, type AssetRouteType } from "../../../../../lib/assets";
import { T } from "../../../../../components/language-provider";

export default async function EditAssetPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType; id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { type, id } = await params;
  const { scope = "" } = await searchParams;
  const asset = (await getRouteAssetWithDatabase(type, id, scope)) as unknown as Record<string, unknown>;
  const assetType = routeToAssetType(type);

  return (
    <>
      <PageHeader title={<><T k="action.edit" /> <T k={assetTitleKeys[type]} /></>} description={<><T k="asset.editDescriptionPrefix" /> {id}</>} />
      <AssetDraftForm assetType={assetType} routeType={type} initialAsset={asset} />
    </>
  );
}
