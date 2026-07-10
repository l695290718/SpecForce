import { PageHeader } from "../../../../components/ui";
import { AssetDraftForm } from "../../../../components/asset-draft-form";
import { assetTitleKeys, routeToAssetType, type AssetRouteType } from "../../../../lib/assets";
import { T } from "../../../../components/language-provider";

export default async function NewAssetPage({ params }: { params: Promise<{ type: AssetRouteType }> }) {
  const { type } = await params;
  const assetType = routeToAssetType(type);

  return (
    <>
      <PageHeader title={<><T k="action.new" /> <T k={assetTitleKeys[type]} /></>} description={<T k="asset.newDescription" />} />
      <AssetDraftForm assetType={assetType} routeType={type} />
    </>
  );
}
