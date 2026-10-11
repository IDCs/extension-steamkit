import { request } from "node:https";

import { MODS_PER_PAGE } from "../constants";
import { ErrorKind, SteamkitError } from "../types/errors";
import { IWorkshopMod } from "../types/interface";

const STEAM_WEB_API = "https://api.steampowered.com";
const REQUEST_TIMEOUT_MS = 20_000;

/** How Workshop results are ordered, as Steam's query_type. */
export const WorkshopSorting = { ByVote: 0, ByDate: 1, ByTrend: 3 } as const;
export type WorkshopSorting = (typeof WorkshopSorting)[keyof typeof WorkshopSorting];

export interface IWorkshopQuery {
  page: number;
  search: string;
  sorting: WorkshopSorting;
}

export interface IWorkshopPage {
  items: IWorkshopMod[];
  total: number;
}

/** A page of an app's Workshop items, as Steam's QueryFiles call. */
export function workshopQueryUrl(webApiKey: string, appId: number, query: IWorkshopQuery): URL {
  const url = new URL(`${STEAM_WEB_API}/IPublishedFileService/QueryFiles/v1/`);
  url.search = new URLSearchParams({
    key: webApiKey,
    appid: String(appId),
    creator_appid: String(appId),
    query_type: String(query.sorting),
    page: String(query.page),
    numperpage: String(MODS_PER_PAGE),
    return_children: "true",
    return_vote_data: "true",
    return_short_description: "true",
    ...(query.search !== "" ? { search_text: query.search } : {}),
  }).toString();
  return url;
}

// Node's HTTP client, since Steam's Web API doesn't allow the renderer's cross-origin fetch.
function getJson(url: URL): Promise<any> {
  return new Promise((resolve, reject) => {
    const call = request(url, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0;
      if (status !== 200) {
        response.resume();
        reject(
          status === 401 || status === 403
            ? new SteamkitError(ErrorKind.AccessDenied, "Steam did not accept the Steam Web API key")
            : new SteamkitError(ErrorKind.Failed, `Steam answered with HTTP ${status}`),
        );
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
    });
    call.on("timeout", () =>
      call.destroy(Object.assign(new Error("Steam did not answer in time"), { code: "ETIMEDOUT" })),
    );
    call.on("error", reject);
    call.end();
  });
}

/** A page of an app's Workshop items, and how many items the query has in all. */
export async function queryWorkshop(
  webApiKey: string,
  appId: number,
  query: IWorkshopQuery,
): Promise<IWorkshopPage> {
  const data = await getJson(workshopQueryUrl(webApiKey, appId, query));
  return { items: data.response?.publishedfiledetails ?? [], total: data.response?.total ?? 0 };
}

/** The Steam name of a Workshop item's creator, by SteamID; undefined when Steam doesn't say. */
export async function creatorName(webApiKey: string, creatorSteamId: string): Promise<string | undefined> {
  const url = new URL(`${STEAM_WEB_API}/ISteamUser/GetPlayerSummaries/v2/`);
  url.search = new URLSearchParams({ key: webApiKey, steamids: creatorSteamId }).toString();
  const data = await getJson(url);
  return data.response?.players?.[0]?.personaname;
}
