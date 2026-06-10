import { AssetLibrary } from "../../../../components/AssetLibrary";
import { GeneratedMedia } from "../../../../components/GeneratedMedia";

export const metadata = { title: "Assets — Cineforge" };

export default function AssetsPage() {
  return (
    <>
      <AssetLibrary />
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <GeneratedMedia />
      </div>
    </>
  );
}
