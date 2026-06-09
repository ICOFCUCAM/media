/**
 * Multi-entry creative architecture. A project can begin from many different
 * assets — not just a prompt box. This module is the source of truth for the
 * project types and the creation modes (entry points) surfaced in /create.
 *
 * Every mode resolves to the same data model (projects → scenes → shots) and the
 * same render pipeline; they differ only in how the initial scene plan is made.
 */

export type ModeStatus = "live" | "beta" | "soon";

/** Workspace surfaces that the Create Film studio can render (the mode rail). */
export type StudioMode = "prompt" | "script" | "storyboard" | "image" | "audio" | "video";

export interface ProjectType {
  id: string;
  title: string;
  blurb: string;
  href: string;
  defaultSeconds: number;
}

export const PROJECT_TYPES: ProjectType[] = [
  { id: "film", title: "Film", blurb: "Feature-length, single story.", href: "/create/film", defaultSeconds: 1800 },
  { id: "series", title: "Series", blurb: "Multi-episode show with continuity.", href: "/create/series", defaultSeconds: 3600 },
  { id: "trailer", title: "Trailer", blurb: "Teasers and festival cuts.", href: "/create/trailer", defaultSeconds: 30 },
  { id: "commercial", title: "Commercial", blurb: "Brand spots and product films.", href: "/create/film?type=commercial", defaultSeconds: 30 },
  { id: "social", title: "Social Campaign", blurb: "Vertical clips for every feed.", href: "/create/shorts", defaultSeconds: 15 },
  { id: "music", title: "Music Video", blurb: "Visuals cut to a track.", href: "/create/film?type=music", defaultSeconds: 180 },
  { id: "documentary", title: "Documentary", blurb: "Narration-led, archival feel.", href: "/create/film?type=documentary", defaultSeconds: 1800 },
];

export const projectTypeById = (id?: string | null) => PROJECT_TYPES.find((t) => t.id === id);

export interface CreationMode {
  id: string;
  title: string;
  blurb: string;
  status: ModeStatus;
  /** Where selecting this mode takes the creator. */
  href: string;
  /** The studio surface it maps to (for routes under /create/film). */
  studio?: StudioMode;
}

/** The ten first-class creation paths. */
export const CREATION_MODES: CreationMode[] = [
  {
    id: "prompt",
    title: "Prompt → Film",
    blurb: "Describe it in a sentence. The studio writes, casts, films and scores the whole thing.",
    status: "live",
    href: "/create/film?mode=prompt",
    studio: "prompt",
  },
  {
    id: "script",
    title: "Script → Film",
    blurb: "Paste or write a screenplay. We break it into a shot list, scenes and a cut.",
    status: "live",
    href: "/create/film?mode=script",
    studio: "script",
  },
  {
    id: "storyboard",
    title: "Scene-by-Scene",
    blurb: "Professional mode: build each scene by hand and render them individually.",
    status: "live",
    href: "/create/film?mode=storyboard",
    studio: "storyboard",
  },
  {
    id: "image",
    title: "Image → Video",
    blurb: "Start from one or more images. Add motion and cinematic camera per shot.",
    status: "live",
    href: "/create/film?mode=image",
    studio: "image",
  },
  {
    id: "boards",
    title: "Storyboard → Film",
    blurb: "Upload storyboard frames; we turn each board into a scene and animate it.",
    status: "beta",
    href: "/create/film?mode=image",
    studio: "image",
  },
  {
    id: "audio",
    title: "Audio → Film",
    blurb: "Upload narration or a voice recording; we build the visuals around it.",
    status: "beta",
    href: "/create/film?mode=audio",
    studio: "audio",
  },
  {
    id: "video",
    title: "Video → Video",
    blurb: "Upload a clip and generate variations, extensions, remasters or a sequel.",
    status: "beta",
    href: "/create/film?mode=video",
    studio: "video",
  },
  {
    id: "character",
    title: "Character-First",
    blurb: "Design a character, then build scenes and stories around them.",
    status: "soon",
    href: "/library/characters",
  },
  {
    id: "world",
    title: "World-First",
    blurb: "Create a kingdom, city or universe, then generate stories inside it.",
    status: "soon",
    href: "/library/worlds",
  },
  {
    id: "episode",
    title: "Episode-First",
    blurb: "Build a series one episode at a time with a persistent cast.",
    status: "live",
    href: "/create/series",
  },
];

export const STUDIO_MODES: { id: StudioMode; label: string; status: ModeStatus }[] = [
  { id: "prompt", label: "Prompt", status: "live" },
  { id: "script", label: "Script", status: "live" },
  { id: "storyboard", label: "Scene-by-Scene", status: "live" },
  { id: "image", label: "Image", status: "live" },
  { id: "audio", label: "Audio", status: "beta" },
  { id: "video", label: "Video", status: "beta" },
];
