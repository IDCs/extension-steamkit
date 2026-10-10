import type { IWorkshopMod } from "../types/interface";

/** Total up and down votes a workshop item has received. */
export function totalVotes(voteData: Partial<IWorkshopMod["vote_data"]> | undefined): number {
  return (voteData?.votes_up ?? 0) + (voteData?.votes_down ?? 0);
}
