import { PageHeader } from "../../../../../components/ui";
import { AssetDraftForm } from "../../../../../components/asset-draft-form";
import { assetTitleKeys, getRouteAsset, routeToAssetType, type AssetRouteType } from "../../../../../lib/assets";
import { T } from "../../../../../components/language-provider";

export default async function EditAssetPage({ params }: { params: Promise<{ type: AssetRouteType; id: string }> }) {
  const { type, id } = await params;
  const asset = getRouteAsset(type, id) as unknown as Record<string, unknown>;
  const assetType = routeToAssetType(type);

  return (
    <>
      <PageHeader title={<><T k="action.edit" /> <T k={assetTitleKeys[type]} /></>} description={<><T k="asset.editDescriptionPrefix" /> {id}</>} />
      <AssetDraftForm assetType={assetType} routeType={type} initialAsset={asset} />
    </>
  );
}
