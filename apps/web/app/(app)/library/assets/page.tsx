import { AssetLibrary } from "../../../../components/AssetLibrary";
import { GeneratedMedia } from "../../../../components/GeneratedMedia";

export const metadata = { title: "Assets — Cineforge" };

export default function AssetsPage() {
  return (
    <AssetLibrary>
      <GeneratedMedia />
    </AssetLibrary>
  );
}
