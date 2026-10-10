import path from "path";

import {
  mdiAlertCircleOutline,
  mdiHistory,
  mdiKeyVariant,
  mdiMagnifyRemoveOutline,
  mdiRefresh,
  mdiShieldCheckOutline,
  mdiSteam,
} from "@mdi/js";
import { MainContext, MainPage, selectors } from "@nexusmods/vortex-api";
import { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

import { MODS_PER_PAGE } from "../constants";
import { IWorkshopMod, WorkshopAccess, WorkshopAccessState } from "../types/interface";
import { gameMods } from "../selectors";
import { reportError } from "../util/errors";
import { QueryType } from "../util/Scrubber";
import { installedWorkshopItemIds } from "../util/workshopItems";
import WorkshopTile, { WorkshopTileSkeleton } from "./WorkshopTile";
import { Button, ButtonStyle, IPickerOption, NoResults, Pagination, Picker, SearchField } from "./vortexUi";

interface IWorkshopPageProps {
  onGameModeActivated: (gameId: string) => Promise<WorkshopAccess>;
  /** Asks for a Steam Web API key and saves it; resolves to whether one was saved. */
  onRequestApiKey: () => Promise<boolean>;
  onModClick: (mod: IWorkshopMod) => void;
  onVerifyFiles: () => void;
  onShowGameVersions: () => void;
}

const SORT_OPTIONS: Array<IPickerOption<QueryType>> = [
  { label: "Newest", value: QueryType.ByDate },
  { label: "Highest Rated", value: QueryType.ByVote },
  { label: "Trending", value: QueryType.ByTrend },
];

const ListingState = { Loading: "loading", Ready: "ready", Failed: "failed" } as const;
type Listing =
  | { state: typeof ListingState.Loading }
  | { state: typeof ListingState.Ready; mods: IWorkshopMod[]; total: number }
  | { state: typeof ListingState.Failed };

// Vortex's grid of tiles at least 16rem wide.
const TILE_GRID = "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4";

export default function WorkshopPage(props: IWorkshopPageProps) {
  const { onGameModeActivated, onRequestApiKey, onModClick, onVerifyFiles, onShowGameVersions } = props;
  const [t] = useTranslation();
  const context = React.useContext(MainContext);
  const gameId: string | undefined = useSelector(selectors.activeGameId);
  const fallbackImg = useSelector((state) => gameImage(state, gameId));
  const mods = useSelector((state) => gameMods(state, gameId));
  const installedItemIds = React.useMemo(() => installedWorkshopItemIds(mods), [mods]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [access, setAccess] = React.useState<WorkshopAccess | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [sorting, setSorting] = React.useState<QueryType>(QueryType.ByDate);
  const [searchText, setSearchText] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reloads, setReloads] = React.useState(0);
  const [listing, setListing] = React.useState<Listing>({ state: ListingState.Loading });
  const scrubber = access?.state === WorkshopAccessState.Ready ? access.scrubber : undefined;

  const activate = React.useCallback(async () => {
    if (gameId === undefined) {
      return;
    }
    try {
      setAccess(await onGameModeActivated(gameId));
      setPage(1);
    } catch (err) {
      reportError(context.api, "Failed to open the Steam Workshop", err);
    }
  }, [gameId]);

  React.useEffect(() => {
    void activate();
  }, [activate]);

  React.useEffect(() => {
    if (scrubber === undefined) {
      return undefined;
    }
    let current = true;
    setListing({ state: ListingState.Loading });
    scrubber.scrubPage({ page, filter: search, sorting }).then(
      (mods) => {
        if (current) {
          setListing({ state: ListingState.Ready, mods, total: scrubber.availableTotal() });
        }
      },
      (err) => {
        if (current) {
          setListing({ state: ListingState.Failed });
          reportError(context.api, "Failed to query Steam Workshop", err);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [scrubber, page, search, sorting, reloads]);

  // A new search, sort or refresh starts again from the first page of fresh results.
  const startOver = (change: () => void) => {
    scrubber?.resetDataArray();
    setPage(1);
    change();
  };

  const enterApiKey = async () => {
    if (await onRequestApiKey()) {
      await activate();
    }
  };

  const showPage = (newPage: number) => {
    scrollRef.current?.scrollTo({ top: 0 });
    setPage(newPage);
  };

  return (
    <MainPage>
      <MainPage.Body className="h-full overflow-y-auto pt-6" ref={scrollRef}>
        <div className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-x-2">
            {scrubber !== undefined ? (
              <SearchField
                label={t("Search mods")}
                value={searchText}
                onChange={setSearchText}
                onSearch={() => startOver(() => setSearch(searchText))}
              />
            ) : (
              <div />
            )}
            <div className="flex items-center gap-x-2">
              <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiShieldCheckOutline} onClick={onVerifyFiles}>
                {t("Verify Files")}
              </Button>
              <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiHistory} onClick={onShowGameVersions}>
                {t("Game Versions")}
              </Button>
            </div>
          </div>

          {access?.state === WorkshopAccessState.NeedsApiKey && (
            <NoResults
              iconPath={mdiKeyVariant}
              message={t("Browsing the Steam Workshop in Vortex needs a Steam Web API key.")}
              title={t("Steam Web API key needed")}
            >
              <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiKeyVariant} onClick={() => void enterApiKey()}>
                {t("Enter API Key")}
              </Button>
            </NoResults>
          )}

          {access?.state === WorkshopAccessState.NotSteam && (
            <NoResults
              iconPath={mdiSteam}
              message={t("The Steam Workshop is only available for games installed by Steam.")}
              title={t("Steam Workshop unavailable")}
            />
          )}

          {(access === undefined || scrubber !== undefined) && (
            <>
              {scrubber !== undefined && (
                <div className="flex justify-between">
                  <div className="flex items-center gap-x-2">
                    <Button
                      buttonStyle={ButtonStyle.Neutral}
                      iconPath={mdiRefresh}
                      title={t("Refresh")}
                      onClick={() => startOver(() => setReloads((count) => count + 1))}
                    />
                    {listing.state === ListingState.Ready && (
                      <p className="text-body-sm text-translucent-moderate">
                        {t("{{count}} results", { count: listing.total })}
                      </p>
                    )}
                  </div>
                  <Picker
                    options={SORT_OPTIONS}
                    value={sorting}
                    onChange={(value) => startOver(() => setSorting(value))}
                  />
                </div>
              )}
              <WorkshopListing
                fallbackImg={fallbackImg}
                installedItemIds={installedItemIds}
                listing={access === undefined ? { state: ListingState.Loading } : listing}
                page={page}
                searching={search !== ""}
                t={t}
                onInstall={onModClick}
                onPage={showPage}
                onRetry={() => startOver(() => setReloads((count) => count + 1))}
              />
            </>
          )}
        </div>
      </MainPage.Body>
    </MainPage>
  );
}

interface IWorkshopListingProps {
  t: TFunction;
  listing: Listing;
  page: number;
  searching: boolean;
  fallbackImg: string;
  installedItemIds: Set<string>;
  onInstall: (mod: IWorkshopMod) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
}

function WorkshopListing(props: IWorkshopListingProps) {
  const { t, listing, page, searching, fallbackImg, installedItemIds, onInstall, onPage, onRetry } = props;
  switch (listing.state) {
    case ListingState.Loading:
      return (
        <div className={TILE_GRID}>
          {Array.from({ length: 8 }, (_, index) => (
            <WorkshopTileSkeleton key={`skeleton-${index}`} />
          ))}
        </div>
      );
    case ListingState.Failed:
      return (
        <NoResults
          iconPath={mdiAlertCircleOutline}
          message={t("Check your connection and Steam Web API key, then try again.")}
          title={t("Couldn't load the Steam Workshop")}
        >
          <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiRefresh} onClick={onRetry}>
            {t("Try again")}
          </Button>
        </NoResults>
      );
    case ListingState.Ready:
      if (listing.mods.length === 0) {
        return (
          <NoResults
            iconPath={mdiMagnifyRemoveOutline}
            message={
              searching
                ? t("No Steam Workshop items match your search.")
                : t("This game has no Steam Workshop items.")
            }
            title={t("No mods found")}
          />
        );
      }
      return (
        <>
          <div className={TILE_GRID}>
            {listing.mods.map((mod) => (
              <WorkshopTile
                fallbackImg={fallbackImg}
                installed={installedItemIds.has(mod.publishedfileid)}
                key={mod.publishedfileid}
                mod={mod}
                t={t}
                onInstall={onInstall}
              />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(listing.total / MODS_PER_PAGE)}
            onPage={onPage}
          />
        </>
      );
  }
  const exhausted: never = listing;
  throw new Error(`unhandled listing ${JSON.stringify(exhausted)}`);
}

/** The game's logo, shown for a Workshop item without a preview image. */
function gameImage(state: unknown, gameId: string | undefined): string {
  const game = gameId !== undefined ? selectors.gameById(state, gameId) : undefined;
  return game?.extensionPath !== undefined && game?.logo !== undefined
    ? path.join(game.extensionPath, game.logo)
    : path.join(__dirname, "steam.jpg");
}
