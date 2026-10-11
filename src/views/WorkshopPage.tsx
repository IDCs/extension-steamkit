import path from "node:path";

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
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

import { MODS_PER_PAGE, NS } from "../constants";
import { gameMods } from "../selectors";
import { IWorkshopMod, WorkshopAccess, WorkshopAccessState } from "../types/interface";
import { reportError } from "../util/errors";
import { IWorkshopQuery, WorkshopSorting } from "../util/steamWebApi";
import { installedWorkshopItemIds } from "../util/workshopItems";
import { WorkshopPages } from "../util/workshopPages";
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

const SORT_OPTIONS: Array<IPickerOption<WorkshopSorting>> = [
  { label: "Newest", value: WorkshopSorting.ByDate },
  { label: "Highest Rated", value: WorkshopSorting.ByVote },
  { label: "Trending", value: WorkshopSorting.ByTrend },
];

const ListingState = { Loading: "loading", Ready: "ready", Failed: "failed" } as const;
type Listing =
  | { state: typeof ListingState.Loading }
  | { state: typeof ListingState.Ready; mods: IWorkshopMod[]; total: number }
  | { state: typeof ListingState.Failed };

const LOADING: Listing = { state: ListingState.Loading };

/** A listing, with the pages and query it answers. */
interface IFetched {
  pages: WorkshopPages;
  query: IWorkshopQuery;
  reloads: number;
  listing: Listing;
}

// Vortex's grid of tiles at least 16rem wide.
const TILE_GRID = "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4";

export default function WorkshopPage(props: IWorkshopPageProps) {
  const gameId: string | undefined = useSelector(selectors.activeGameId);
  // Mounted per game, so nothing of the previous game's Workshop carries over.
  return gameId !== undefined ? <GameWorkshopPage {...props} gameId={gameId} key={gameId} /> : null;
}

function GameWorkshopPage(props: IWorkshopPageProps & { gameId: string }) {
  const { gameId, onGameModeActivated, onRequestApiKey, onModClick, onVerifyFiles, onShowGameVersions } = props;
  const { t } = useTranslation(NS);
  const context = React.useContext(MainContext);
  const fallbackImg = useSelector((state) => gameImage(state, gameId));
  const mods = useSelector((state) => gameMods(state, gameId));
  const installedItemIds = React.useMemo(() => installedWorkshopItemIds(mods), [mods]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const [access, setAccess] = React.useState<WorkshopAccess | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [sorting, setSorting] = React.useState<WorkshopSorting>(WorkshopSorting.ByDate);
  const [searchText, setSearchText] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reloads, setReloads] = React.useState(0);
  const [fetched, setFetched] = React.useState<IFetched | undefined>(undefined);
  const pages = access?.state === WorkshopAccessState.Ready ? access.pages : undefined;
  const query = React.useMemo(() => ({ page, search, sorting }), [page, search, sorting]);

  const activate = React.useCallback(async () => {
    try {
      setAccess(await onGameModeActivated(gameId));
    } catch (err) {
      reportError(context.api, "Failed to open the Steam Workshop", err);
    }
  }, [gameId]);

  React.useEffect(() => {
    void activate();
  }, [activate]);

  React.useEffect(() => {
    if (pages === undefined) {
      return undefined;
    }
    let current = true;
    const settle = (listing: Listing) => {
      if (current) {
        setFetched({ pages, query, reloads, listing });
      }
    };
    pages.page(query).then(
      ({ items, total }) => settle({ state: ListingState.Ready, mods: items, total }),
      (err) => {
        settle({ state: ListingState.Failed });
        if (current) {
          reportError(context.api, "Failed to query Steam Workshop", err);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [pages, query, reloads]);

  const listing =
    fetched !== undefined && fetched.pages === pages && fetched.query === query && fetched.reloads === reloads
      ? fetched.listing
      : LOADING;

  const refresh = () => {
    pages?.clear();
    setReloads((count) => count + 1);
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
            {pages !== undefined ? (
              <SearchField
                label={t("Search mods")}
                value={searchText}
                onChange={setSearchText}
                onSearch={() => {
                  setPage(1);
                  setSearch(searchText);
                }}
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

          {(access === undefined || pages !== undefined) && (
            <>
              {pages !== undefined && (
                <div className="flex justify-between">
                  <div className="flex items-center gap-x-2">
                    <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiRefresh} title={t("Refresh")} onClick={refresh} />
                    {listing.state === ListingState.Ready && (
                      <p className="text-body-sm text-translucent-moderate">
                        {t("{{count}} results", { count: listing.total })}
                      </p>
                    )}
                  </div>
                  <Picker
                    options={SORT_OPTIONS}
                    value={sorting}
                    onChange={(value) => {
                      setPage(1);
                      setSorting(value);
                    }}
                  />
                </div>
              )}
              <WorkshopListing
                fallbackImg={fallbackImg}
                installedItemIds={installedItemIds}
                listing={access === undefined ? LOADING : listing}
                page={page}
                searching={search !== ""}
                onInstall={onModClick}
                onPage={showPage}
                onRetry={refresh}
              />
            </>
          )}
        </div>
      </MainPage.Body>
    </MainPage>
  );
}

interface IWorkshopListingProps {
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
  const { listing, page, searching, fallbackImg, installedItemIds, onInstall, onPage, onRetry } = props;
  const { t } = useTranslation(NS);
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
function gameImage(state: unknown, gameId: string): string {
  const game = selectors.gameById(state, gameId);
  return game?.extensionPath !== undefined && game?.logo !== undefined
    ? path.join(game.extensionPath, game.logo)
    : path.join(__dirname, "steam.jpg");
}
