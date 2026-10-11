import type { WorkshopPages } from "../util/workshopPages";

export interface ISteamKitParameters {
  Username?: string;
  Password?: string;
  RememberPassword?: boolean;
  ManifestOnly?: boolean;
  CellId?: number;

  /** Files to verify, one per line, relative to the install directory or absolute. */
  FileList?: string;
  InstallDirectory?: string;
  VerifyAll?: boolean;
  MaxDownloads?: number;
  LoginId?: number;

  // Steam app id
  AppId?: number;
  /** The Workshop item to download instead of the app. A string, since published file ids are 64-bit. */
  PubFile?: string;

  Branch?: string;
  BetaBranchPassword?: string;
  DepotIdList?: number[];
  /** The manifest of each depot in DepotIdList. Strings, since manifest ids are 64-bit. */
  ManifestIdList?: string[];
}

export interface IWorkshopMod {
  app_name: string;
  ban_reason: string;
  ban_text_check_result: number;
  banned: boolean;
  banner: string;
  can_be_deleted: boolean;
  can_subscribe: boolean;

  // Steam app id
  consumer_appid: number;
  consumer_shortcutid: number;
  creator: string;
  creator_appid: number;
  favorited: number;
  file_size: string;
  file_type: number;
  filename: string;
  flags: number;
  followers: number;
  short_description: string;
  lifetime_favorited: number;
  lifetime_followers: number;
  lifetime_playtime: string;
  lifetime_playtime_sessions: string;
  lifetime_subscriptions: number;
  maybe_inappropriate_sex: boolean;
  maybe_inappropriate_violence: boolean;
  num_children: number;
  preview_file_size: string;
  preview_url: string;

  // UGC id
  publishedfileid: string;
  subscriptions: number;
  time_created: number;
  time_updated: number;
  title: string;
  url: string;
  views: number;
  visibility: number;
  workshop_file: boolean;
  workshop_accepted: boolean;

  vote_data: {
    score: number;
    votes_up: number;
    votes_down: number;
  };
}

/** Whether the Steam Workshop can be browsed for the active game. */
export const WorkshopAccessState = {
  Ready: "ready",
  NeedsApiKey: "needsApiKey",
  NotSteam: "notSteam",
} as const;
export type WorkshopAccessState = (typeof WorkshopAccessState)[keyof typeof WorkshopAccessState];

export type WorkshopAccess =
  | { state: typeof WorkshopAccessState.Ready; pages: WorkshopPages }
  | { state: typeof WorkshopAccessState.NeedsApiKey }
  | { state: typeof WorkshopAccessState.NotSteam };

/** How the user signs in to Steam. */
export const SignInMethod = { Password: "password", QrCode: "qrCode" } as const;
export type SignInMethod = (typeof SignInMethod)[keyof typeof SignInMethod];

/** Why a Steam job asks the user to sign in, shown on the sign-in prompt. */
export interface ISignInPurpose {
  title: string;
  text: string;
}

/** How the user signs in; remember keeps the sign-in so later runs don't ask. */
export type SignInAnswer =
  | { method: typeof SignInMethod.Password; username: string; password: string; remember: boolean }
  | { method: typeof SignInMethod.QrCode; remember: boolean };

/** Called with a download's progress in percent. */
export type ProgressCallback = (percent: number) => void;
