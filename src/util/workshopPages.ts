import { IWorkshopPage, IWorkshopQuery, queryWorkshop } from "./steamWebApi";

/** The Workshop pages of one app for the current search and sorting, so going back a page costs no request. */
export class WorkshopPages {
  private mWebApiKey: string;
  private mAppId: number;
  // the search and sorting the kept pages answer
  private mListingKey: string | undefined;
  // keyed by page number
  private mPages = new Map<number, Promise<IWorkshopPage>>();

  constructor(webApiKey: string, appId: number) {
    this.mWebApiKey = webApiKey;
    this.mAppId = appId;
  }

  public page(query: IWorkshopQuery): Promise<IWorkshopPage> {
    const listingKey = JSON.stringify([query.search, query.sorting]);
    if (listingKey !== this.mListingKey) {
      this.clear();
      this.mListingKey = listingKey;
    }
    let page = this.mPages.get(query.page);
    if (page === undefined) {
      // A failed request is asked again next time; a cleared map is left as it is.
      const pages = this.mPages;
      page = queryWorkshop(this.mWebApiKey, this.mAppId, query);
      page.catch(() => pages.delete(query.page));
      pages.set(query.page, page);
    }
    return page;
  }

  /** Forgets the pages fetched, so they are asked of Steam again. */
  public clear(): void {
    this.mPages = new Map();
  }
}
