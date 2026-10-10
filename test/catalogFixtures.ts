import type { ICatalog, IGameVersion } from "../src/catalog/types";

export const SKYRIM_SE_APP_ID = 489830;

/** A catalog of Skyrim Special Edition with the given versions. */
export const skyrimSeCatalog = (...versions: IGameVersion[]): ICatalog => ({
  skyrimse: { steamAppId: SKYRIM_SE_APP_ID, versions },
});

/** Skyrim Special Edition 1.5.97's main content and executable depots. */
export const SKYRIM_SE_1_5_97_DEPOTS = [
  { depotId: 489831, manifestId: "7848722008564294070" },
  { depotId: 489833, manifestId: "2289561010626853674" },
];

/** A game version labelled by its id, with Skyrim SE 1.5.97's depots unless given others. */
export function gameVersion(id: string, overrides: Partial<IGameVersion> = {}): IGameVersion {
  return { id, label: id, depots: SKYRIM_SE_1_5_97_DEPOTS, ...overrides };
}
