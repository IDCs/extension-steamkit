import Client from "node-rest-client";

import { MODS_PER_PAGE } from "../constants";
import { ErrorKind, SteamkitError } from "../types/errors";
import { IModsCache, IWorkshopMod } from "../types/interface";

export enum QueryType {
  ByVote = 0,
  ByDate = 1,
  ByTrend = 3,
}

export interface IQueryFilesParameters {
  page?: number;
  filter?: string;
  sorting?: QueryType;
}

const MODS_PER_PAGE_PARAM = `&numperpage=${MODS_PER_PAGE}`;
const QUERY_LINK_TEMPLATE = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key={{key}}&appid={{appId}}&query_type={{type}}&page={{page}}&creator_appid={{appId}}&return_children=true&return_vote_data=true&return_short_description=true${MODS_PER_PAGE_PARAM}{{title}}`;

export class ModScrubber {
  // Steam api key.
  private mApiKey: string;

  private mClient = new Client.Client();
  // Steam app id
  private mAppId: string;
  private mCurrentAvailableTotal: number;
  private mDataArray: IModsCache;
  private mCurrentFilter: string;

  public init(appId: string, webApiKey: string) {
    this.resetDataArray();
    this.mApiKey = webApiKey;
    this.mAppId = appId;
  }

  private findFileIdInPage(fileId: string, page: string) {
    return this.mDataArray[page]?.find((entry) => entry.publishedfileid === fileId);
  }

  private isInCache(publishedfileId: string) {
    const reversed = Object.keys(this.mDataArray).reverse();
    for (const page of reversed) {
      const entry = this.findFileIdInPage(publishedfileId, page);
      if (entry !== undefined) {
        return true;
      }
    }
    return false;
  }

  /** A Steam Web API response; a refused key is AccessDenied, any other non-200 answer Failed. */
  private getJson(link: string): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const request = this.mClient.get(link, (data, response) => {
          if (response.statusCode === 401 || response.statusCode === 403) {
            return reject(
              new SteamkitError(ErrorKind.AccessDenied, "Steam did not accept the Steam Web API key"),
            );
          }
          if (response.statusCode !== 200) {
            return reject(
              new SteamkitError(ErrorKind.Failed, `Steam answered with HTTP ${response.statusCode}`),
            );
          }
          return resolve(data);
        });
        request.on("error", reject);
      } catch (err) {
        return reject(err);
      }
    });
  }

  private async scrub(qLink: string): Promise<IWorkshopMod[]> {
    if (!qLink) {
      return [];
    }
    const data = await this.getJson(qLink);
    if (this.mCurrentAvailableTotal === 0 && data.response.total === 0) {
      return [];
    }
    if (!this.mCurrentAvailableTotal) {
      this.mCurrentAvailableTotal = data.response.total;
    }
    return (data.response.publishedfiledetails ?? []).filter(
      (fileDetails: IWorkshopMod) => fileDetails && !this.isInCache(fileDetails.publishedfileid),
    );
  }

  private generateLink(parameters: IQueryFilesParameters): string {
    if (!this.mAppId) {
      return null;
    }
    const filter = this.mCurrentFilter ? `&search_text=${this.mCurrentFilter}` : "";
    return QUERY_LINK_TEMPLATE.replace(/{{appId}}/g, this.mAppId)
      .replace(/{{type}}/, parameters.sorting.toFixed())
      .replace("{{key}}", this.mApiKey)
      .replace("{{page}}", String(parameters.page ?? 1))
      .replace("{{title}}", filter);
  }

  /** The Steam name of a Workshop item's creator, by SteamID; undefined when Steam doesn't say. */
  public async creatorName(creatorSteamId: string): Promise<string | undefined> {
    const data = await this.getJson(
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/" +
        `?key=${this.mApiKey}&steamids=${creatorSteamId}`,
    );
    return data.response?.players?.[0]?.personaname;
  }

  public availableTotal(): number {
    return this.mCurrentAvailableTotal ?? 0;
  }

  /** Forgets the pages and total fetched, for a new search or sort. */
  public resetDataArray() {
    this.mDataArray = {};
    this.mCurrentAvailableTotal = 0;
  }

  public async scrubPage(query: IQueryFilesParameters): Promise<IWorkshopMod[]> {
    if (this.mDataArray[query.page] !== undefined) {
      return this.mDataArray[query.page];
    }
    if (query?.filter !== this.mCurrentFilter) {
      this.mCurrentFilter = query.filter;
    }
    const res: IWorkshopMod[] = await this.scrub(this.generateLink(query));
    this.mDataArray[query.page] = res;
    return res;
  }
}
