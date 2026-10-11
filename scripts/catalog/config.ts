import * as z from "zod";

import { PUBLIC_BRANCH } from "./candidates";

const GameSources = z.strictObject({
  /** The depots a version pins, when they differ from the game's newest listed version. */
  depots: z.array(z.int().positive()).min(1).optional(),
  /** Labels by Steam branch name, for branches whose name doesn't say the version. */
  labels: z
    .record(z.string(), z.string().min(1))
    .refine((labels) => !(PUBLIC_BRANCH in labels), "the default branch moves on to other builds, so it takes no label")
    .optional(),
  /** BUTR's builds of the game's Steam app; history also takes builds no branch serves. */
  butr: z.strictObject({ history: z.boolean().default(false) }).optional(),
});

/** How the catalog update finds each game's versions; every game gets the Steam app info source. */
export const SourcesConfig = z.strictObject({
  // keyed by Vortex game id
  games: z.record(z.string(), GameSources),
});
export type ISourcesConfig = z.output<typeof SourcesConfig>;
