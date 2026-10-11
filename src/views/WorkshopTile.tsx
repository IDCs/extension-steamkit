import { mdiAccountMultiple, mdiCheck, mdiDownload, mdiImageBroken, mdiOpenInNew, mdiThumbUp } from "@mdi/js";
import { util } from "@nexusmods/vortex-api";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { NS, workshopItemUrl } from "../constants";
import { IWorkshopMod } from "../types/interface";
import { logError } from "../util/errors";
import { totalVotes } from "../util/votes";
import { Button, ButtonStyle, MdiIcon } from "./vortexUi";

// Vortex's file size icon (ui/icon-paths.ts nxmFileSize).
const FILE_SIZE_ICON =
  "M4.90625 10.6887L7.30312 5.90188C7.43766 5.63114 7.64505 5.4033 7.90197 5.24398C8.1589 5.08465 8.45518 5.00016 8.7575 5H16.4925C16.7948 5.00016 17.0911 5.08465 17.348 5.24398C17.605 5.4033 17.8123 5.63114 17.9469 5.90188L20.3437 10.6887H4.90625ZM4.5 16.375V11.5H20.75V16.375C20.75 16.806 20.5788 17.2193 20.274 17.524C19.9693 17.8288 19.556 18 19.125 18H6.125C5.69402 18 5.2807 17.8288 4.97595 17.524C4.6712 17.2193 4.5 16.806 4.5 16.375ZM7.9375 13.9375C7.38522 13.9375 6.9375 14.3852 6.9375 14.9375C6.9375 15.4898 7.38522 15.9375 7.9375 15.9375H7.9475C8.49978 15.9375 8.9475 15.4898 8.9475 14.9375C8.9475 14.3852 8.49978 13.9375 7.9475 13.9375H7.9375ZM10.1875 14.9375C10.1875 14.3852 10.6352 13.9375 11.1875 13.9375H11.1975C11.7498 13.9375 12.1975 14.3852 12.1975 14.9375C12.1975 15.4898 11.7498 15.9375 11.1975 15.9375H11.1875C10.6352 15.9375 10.1875 15.4898 10.1875 14.9375Z";

// Steam only rates an item once it has enough votes.
const MIN_RATED_VOTES = 10;

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

const ImageState = { Loading: "loading", Loaded: "loaded", Failed: "failed" } as const;
type ImageState = (typeof ImageState)[keyof typeof ImageState];

interface IWorkshopTileProps {
  mod: IWorkshopMod;
  fallbackImg: string;
  /** Whether one of the game's mods was installed from this item. */
  installed: boolean;
  onInstall: (mod: IWorkshopMod) => void;
}

function Stat({ iconPath, text }: { iconPath: string; text: string }) {
  return (
    <div className="flex items-center gap-x-1">
      <MdiIcon className="shrink-0 size-4 text-neutral-subdued" path={iconPath} />
      <p className="text-body-sm text-neutral-moderate">{text}</p>
    </div>
  );
}

/** A Steam Workshop item, laid out as Vortex's collection tiles are. */
function WorkshopTile({ mod, fallbackImg, installed, onInstall }: IWorkshopTileProps) {
  const { t } = useTranslation(NS);
  const [imageState, setImageState] = React.useState<ImageState>(ImageState.Loading);
  const votes = totalVotes(mod.vote_data);

  const openPage = () => {
    util
      .opn(workshopItemUrl(mod.publishedfileid))
      .catch((err) => logError("Failed to open the mod's Steam page", err));
  };

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md bg-surface-mid">
      <div className="nxm-image nxm-image-mod w-full">
        {imageState === ImageState.Failed ? (
          <MdiIcon className="shrink-0 nxm-image-fallback" path={mdiImageBroken} />
        ) : (
          <img
            alt={mod.title}
            className={
              imageState === ImageState.Loaded
                ? "nxm-image-media nxm-image-media-cover"
                : "nxm-image-media nxm-image-media-cover nxm-image-media-pending"
            }
            src={mod.preview_url !== undefined && mod.preview_url !== "" ? mod.preview_url : fallbackImg}
            onError={() => setImageState(ImageState.Failed)}
            onLoad={() => setImageState(ImageState.Loaded)}
          />
        )}
        <div className="nxm-image-frame" />
      </div>

      <div className="flex min-w-0 grow flex-col gap-y-1.5 p-3">
        <p className="text-body-lg text-neutral-strong truncate font-semibold wrap-break-word" title={mod.title}>
          {mod.title}
        </p>
        <div className="flex items-center gap-x-5 border-t border-stroke-weak pt-1.5">
          {votes > MIN_RATED_VOTES && (
            <Stat iconPath={mdiThumbUp} text={`${Math.round(mod.vote_data.score * 100)}%`} />
          )}
          <Stat iconPath={mdiAccountMultiple} text={compactNumber.format(mod.subscriptions ?? 0)} />
          <Stat iconPath={FILE_SIZE_ICON} text={util.bytesToString(Number(mod.file_size ?? 0))} />
        </div>
        <p className="text-body-sm text-neutral-subdued line-clamp-3 border-t border-stroke-weak pt-1.5 wrap-break-word">
          {util.bbcodeToReact(mod.short_description ?? "")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-x-2 rounded-b bg-surface-translucent-low px-3 py-2">
        {installed ? (
          <Button buttonStyle={ButtonStyle.Quiet} disabled={true} iconPath={mdiCheck} small={true}>
            {t("Installed")}
          </Button>
        ) : (
          <Button buttonStyle={ButtonStyle.Primary} iconPath={mdiDownload} small={true} onClick={() => onInstall(mod)}>
            {t("Install")}
          </Button>
        )}
        <Button buttonStyle={ButtonStyle.Quiet} iconPath={mdiOpenInNew} small={true} onClick={openPage}>
          {t("View page")}
        </Button>
      </div>
    </div>
  );
}

export default React.memo(WorkshopTile);

/** Stands in for a tile while the page loads. */
export function WorkshopTileSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-md bg-surface-translucent-mid">
      <div className="nxm-image nxm-image-mod w-full bg-surface-translucent-mid" />
      <div className="space-y-2 p-3">
        <div className="h-6 w-3/4 rounded-sm bg-surface-translucent-mid" />
        <div className="flex items-center gap-x-5">
          <div className="h-3 w-10 rounded-sm bg-surface-translucent-mid" />
          <div className="h-3 w-20 rounded-sm bg-surface-translucent-mid" />
          <div className="h-3 w-10 rounded-sm bg-surface-translucent-mid" />
        </div>
        <div className="h-3 w-full rounded-sm bg-surface-translucent-mid" />
        <div className="h-3 w-3/4 rounded-sm bg-surface-translucent-mid" />
      </div>
      <div className="flex shrink-0 items-center gap-x-2 rounded-b bg-surface-translucent-mid px-3 py-2">
        <div className="h-6 w-24 rounded-sm bg-surface-translucent-mid" />
        <div className="h-6 w-24 rounded-sm bg-surface-translucent-mid" />
      </div>
    </div>
  );
}
