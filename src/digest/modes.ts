import { ModeName, ModeProfile } from "./types";

/**
 * The reading modes, as presets of the two filters that already exist.
 *
 * Nothing here is a new mechanism: `topics` is the same hard channel filter
 * /topics writes, `focus` the same editorial brief /focus writes. A mode is
 * the pair, named — which is what makes it switchable, because switching is
 * then just parking one pair and loading another.
 *
 * The briefs are written in the second person and in ordinary words on
 * purpose: they are read by the summariser, not parsed by code, and a person
 * who disagrees with one can edit it with /focus and stay in the mode.
 */

export interface ModePreset {
  label: string;
  /** One line, shown when switching, so the mode announces what it will do. */
  blurb: string;
  topics: string[];
  focus: string;
}

export const MODES: Record<Exclude<ModeName, "custom" | "auto">, ModePreset> = {
  cultural: {
    label: "Cultural",
    blurb: "concerts, theatre, exhibitions and what's on — dates and venues kept",
    topics: [
      "культура", "концерты", "театр", "выставки", "кино", "афиша событий",
      "culture", "concerts", "theatre", "exhibitions", "events",
    ],
    focus:
      "You read for what is happening and what you could go to. Announcements of concerts, plays, " +
      "exhibitions, festivals and screenings are the point: ALWAYS keep the date, the city and the venue, " +
      "because an announcement without them is useless. When tickets open or a run ends, say so. " +
      "Reviews, interviews and cultural gossip are worth one line each in Briefly unless they change " +
      "whether you would go.",
  },
  work: {
    label: "Work",
    blurb: "what changes what you have to do — decisions, deadlines, rule changes",
    topics: [
      "работа", "отрасль", "законы", "регулирование", "налоги", "рынок труда",
      "work", "industry", "regulation", "law changes", "compliance", "tooling",
    ],
    focus:
      "You read for things that change what you have to do. Lead with anything that creates an " +
      "obligation or a deadline: a law or regulation that changed, a rule taking effect, a decision " +
      "someone is waiting on you for, a client or project development. Keep dates, who is affected, and " +
      "from when. Commentary, opinion pieces and general industry news are worth one line each in " +
      "Briefly unless they change a decision you would make.",
  },
};

/**
 * What a mode starts from the first time someone enters it.
 *
 * `auto` and `custom` are deliberately absent from the presets: neither has an
 * opinion of its own. Custom is whatever the person set by hand, and auto
 * begins from wherever they already were and learns from there — starting it
 * from a blank filter would make the bot briefly worse for the privilege of
 * later becoming better.
 */
export function presetProfile(mode: ModeName, current: ModeProfile): ModeProfile {
  if (mode === "cultural" || mode === "work") {
    return { topics: MODES[mode].topics, focus: MODES[mode].focus, verdicts: {}, overrides: {} };
  }
  return { ...current, verdicts: { ...current.verdicts }, overrides: { ...current.overrides } };
}

export function modeLabel(mode: ModeName): string {
  if (mode === "cultural" || mode === "work") return MODES[mode].label;
  return mode === "auto" ? "Auto" : "Custom";
}

export function modeBlurb(mode: ModeName): string {
  if (mode === "cultural" || mode === "work") return MODES[mode].blurb;
  return mode === "auto"
    ? "learns what you read for from how you use the bot"
    : "whatever you set yourself with /topics and /focus";
}

export function isModeName(value: string): value is ModeName {
  return value === "auto" || value === "cultural" || value === "work" || value === "custom";
}
