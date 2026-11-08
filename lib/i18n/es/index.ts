/**
 * Spanish (neutral Latin American — written for staff in El Salvador: "tú",
 * "celular", "computadora", never Spain-only forms like "vosotros"/"ordenador").
 * Each UI area keeps its own fragment so they can be edited independently; keys
 * are the English source strings. See common.ts for the glossary.
 */
import { common } from "./common";
import { learning } from "./learning";
import { org } from "./org";
import { coach } from "./coach";
import { progress } from "./progress";
import { shell } from "./shell";
import { create } from "./create";
import { errors } from "./errors";

/** Every fragment, by name — tests check they never disagree on a shared key. */
export const ES_FRAGMENTS: Record<string, Record<string, string>> = {
  common,
  learning,
  org,
  coach,
  progress,
  shell,
  create,
  errors,
};

export const ES: Record<string, string> = Object.assign({}, ...Object.values(ES_FRAGMENTS));
