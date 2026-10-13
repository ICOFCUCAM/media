"use client";

/**
 * CineForge Ads Studio — the uploaded design (docs/design/cineforge_ad_studio.html) as a
 * CineForge page: same copy, same images, same layout and behaviour, styles
 * scoped under .cf-ads. Connected to production (docs/47):
 *
 *   - the storyboard is written by the Ads Studio writer from whatever the
 *     owner gives — a brief, a website, brand files, a style, a length, a
 *     voice choice (W32): each scene's look and line, editable here;
 *   - "Produce this ad in CineForge" turns the edited storyboard into the
 *     advert's full plan and creates one advert per output format; the worker
 *     makes the stills, video, voice-over, music and sound, and renders it;
 *   - "Analyse" fetches and reads the page on the server — by the model when
 *     one is configured, else from the page's own structure; only facts quoted
 *     from the page are kept, and they feed the storyboard (A2, W32);
 *   - a logo and product photographs are uploaded to the owner's brand folder
 *     and recorded on the advert: the logo closes the film as supplied, the
 *     photographs are the references for shots that show the product (A3);
 *   - once an advert is planned, the storyboard can open it and send a scene
 *     edit through the Director chat — the Director workspace's own path (A5).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AD_SCENES, ASPECT_OF, cardsFrom, defaultBrandRole, directorBrief, FACT_LABEL, productionPlan, respan, unsplash, voiceMode, writtenFrom,
  type AdScene, type AdStudioState, type BrandRole, type SiteAnalysis,
} from "../../lib/ads-studio";
import {
  analyseWebsite, brandFileProblem, listAdverts, loadLiveScenes, loadLiveState, produceAd, PRODUCT_PHOTOS_MAX, reviseLiveScene, sceneInstructions, signedInUserId,
  uploadBrandFiles, writeStoryboard, type AdvertProject, type LiveScene, type LiveState, type SceneDraft, type StudioInputs,
} from "../../lib/ads-live";
import { signedUrl } from "../../lib/storyboard";

type ModalKind = "how" | "script" | "timeline" | "plan";

const DURATIONS = [
  { value: "15 seconds", label: "15 sec" },
  { value: "30 seconds", label: "30 sec" },
  { value: "60 seconds", label: "60 sec" },
  { value: "90 seconds", label: "90 sec" },
];
const STYLES = [
  { value: "Cinematic premium", label: "Cinematic" },
  { value: "Corporate professional", label: "Corporate" },
  { value: "Energetic social advert", label: "Social energy" },
  { value: "Product demonstration", label: "Product demo" },
  { value: "Documentary storytelling", label: "Documentary" },
];
const APPROACHES = ["AI + my assets", "My assets first", "AI visuals"];
const VOICES = ["Professional narrator", "My authorised cloned voice", "No narration — text and music", "Upload recorded narration"];
const FORMATS = ["16:9 Landscape", "9:16 Vertical", "1:1 Square"];

export function AdsStudio() {
  const [scenes, setScenes] = useState<AdScene[]>(() => AD_SCENES.map((s) => ({ ...s })));
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState({ title: AD_SCENES[0]!.title, duration: AD_SCENES[0]!.duration, visual: AD_SCENES[0]!.visual, message: AD_SCENES[0]!.message });
  const [url, setUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [duration, setDuration] = useState("60 seconds");
  const [style, setStyle] = useState("Cinematic premium");
  const [assets, setAssets] = useState("AI + my assets");
  const [voice, setVoice] = useState(VOICES[0]!);
  const [formats, setFormats] = useState<string[]>(["16:9 Landscape"]);
  const [uploaded, setUploaded] = useState<{ name: string; size: number; type: string; role: BrandRole }[]>([]);
  // The File behind each uploaded entry (same order): only logo / product files are sent to production.
  const files = useRef<File[]>([]);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A5: the live advert this storyboard edits ("" = the concept storyboard on this page).
  const [adverts, setAdverts] = useState<AdvertProject[]>([]);
  const [liveId, setLiveId] = useState("");
  const [live, setLive] = useState<LiveScene[]>([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [liveFrames, setLiveFrames] = useState<Record<string, string>>({});
  const [liveSel, setLiveSel] = useState(0);
  const [liveDraft, setLiveDraft] = useState<SceneDraft & { for: string | null }>({ visual: "", line: "", seconds: 0, for: null });
  const [liveBusy, setLiveBusy] = useState(false);
  // W32: the storyboard was written for these inputs (false = the design's concept cards).
  const [written, setWritten] = useState(false);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState("CONCEPT PREVIEW");
  const [quality, setQuality] = useState("Storyboard preview");
  const [meter, setMeter] = useState<string | undefined>(undefined);
  const [hero, setHero] = useState({ title: "Make your story matter.", subtitle: "Concept → scenes → final film", image: AD_SCENES[0]!.image });
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneUpload = useRef<HTMLInputElement>(null);

  const state: AdStudioState = { url, brief, duration, style, assets, voice, formats, uploaded, scenes, analysis };
  const inputs = (a: SiteAnalysis | null = analysis): StudioInputs => ({
    brief: [brief.trim(), assets !== "AI + my assets" ? `Production approach: ${assets}.` : ""].filter(Boolean).join(" "),
    seconds: parseInt(duration, 10) || 30, style, voice: voiceMode(voice),
    source: a ? { url: a.url, title: a.title, brand: a.brand, fetchedAt: a.fetchedAt, facts: a.facts } : null,
    productPhotos: uploaded.filter((u) => u.role === "product").length, logo: uploaded.some((u) => u.role === "logo"),
  });

  /** W32: write the storyboard from the studio's inputs (brief, website facts, files, style, length, voice). */
  async function writeBoard(a: SiteAnalysis | null = analysis, quiet = false): Promise<AdScene[] | null> {
    if (!brief.trim() && !a?.facts.length) {
      if (!quiet) toast("Describe what the ad should achieve, or analyse a website first.");
      return null;
    }
    setWriting(true);
    try {
      const out = await writeStoryboard(inputs(a));
      const cards = cardsFrom(out.scenes, a?.images ?? []);
      setScenes(cards);
      setWritten(true);
      setSelected(0);
      setDraft({ title: cards[0]!.title, duration: cards[0]!.duration, visual: cards[0]!.visual, message: cards[0]!.message });
      setHero({ title: cards[0]!.message || cards[0]!.title, subtitle: `${cards.length} scenes · ${duration}`, image: cards[0]!.image });
      setStatus("STORYBOARD READY");
      setQuality(`Storyboard written · ${cards.length} scenes${a?.facts.length ? ` · ${a.facts.length} source facts` : ""}`);
      setMeter("60%");
      if (!quiet) toast(`Storyboard written: ${cards.length} scenes. Edit any scene, then produce the ad.`);
      return cards;
    } catch (e) {
      if (!quiet) toast(e instanceof Error ? e.message : "The storyboard could not be written.");
      return null;
    } finally {
      setWriting(false);
    }
  }

  function toast(msg: string) {
    setToastMsg(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 3000);
  }
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    // A new length needs a new storyboard (scene lengths must add up to it).
    if (written) void writeBoard(analysis, true);
  }, [duration]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function selectScene(i: number, list = scenes) {
    setSelected(i);
    const s = list[i]!;
    setDraft({ title: s.title, duration: s.duration, visual: s.visual, message: s.message });
    toast(`Editing scene ${i + 1}: ${s.title}`);
  }
  function saveScene() {
    // Lengths are whole five-second shots.
    const secs = Math.max(5, Math.round((parseInt(draft.duration, 10) || 5) / 5) * 5);
    const d = { ...draft, duration: `${secs} seconds` };
    setDraft(d);
    setScenes((all) => respan(all.map((s, i) => (i === selected ? { ...s, ...d } : s))));
    toast("Scene edits saved to this storyboard; they go into production when you produce the ad.");
  }
  async function regenerateScene() {
    // The writer's version of this scene, for the current inputs (your edits to the other scenes stay).
    try {
      setWriting(true);
      const out = await writeStoryboard(inputs());
      const cur = scenes[selected]!;
      const fresh = out.scenes.find((w) => w.beat === cur.beat) ?? out.scenes[Math.min(selected, out.scenes.length - 1)];
      if (!fresh) return toast("Nothing to rewrite yet: add a brief or analyse a website.");
      const next = { ...cur, title: fresh.title, visual: fresh.visual, message: fresh.message, showProduct: fresh.showProduct };
      setScenes((all) => all.map((s, i) => (i === selected ? next : s)));
      setDraft({ title: next.title, duration: next.duration, visual: next.visual, message: next.message });
      toast(`Scene ${selected + 1} rewritten from your brief${analysis?.facts.length ? " and the page's facts" : ""}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The scene could not be rewritten.");
    } finally {
      setWriting(false);
    }
  }
  async function analyseUrl() {
    const v = url.trim();
    if (!v) return toast("Enter a website URL first.");
    try {
      const u = new URL(v);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    } catch {
      return toast("Enter a valid http:// or https:// URL.");
    }
    // A2: the server fetches the page and the model reads it; only facts quoted from the page come back.
    setAnalysing(true);
    setAnalysisError(null);
    setStatus("ANALYSING");
    try {
      const a = await analyseWebsite(v);
      setAnalysis(a);
      setStatus(a.facts.length ? "SOURCE FACTS READY" : "NO FACTS FOUND");
      // The storyboard follows the page: its facts become the scenes' lines, its pictures the cards'.
      const cards = a.facts.length || brief.trim() ? await writeBoard(a, true) : null;
      toast(a.facts.length
        ? `${a.facts.length} fact(s) quoted from the page${cards ? ` · storyboard written (${cards.length} scenes)` : ""}.`
        : "The page was read, but no fact could be quoted from it. Add a brief to write the storyboard.");
    } catch (e) {
      const m = e instanceof Error ? e.message : "The analysis failed.";
      setAnalysisError(m);
      setStatus("URL READY");
      toast(m);
    } finally {
      setAnalysing(false);
    }
  }

  function addFiles(list: File[], force?: BrandRole) {
    let hasLogo = uploaded.some((u) => u.role === "logo");
    const added = list.map((f) => {
      const role = force ?? defaultBrandRole(f, hasLogo);
      if (role === "logo") hasLogo = true;
      return { name: f.name, size: f.size, type: f.type, role };
    });
    files.current = [...files.current, ...list];
    setUploaded((u) => [...u, ...added]);
    toast(`${list.length} file(s) added. Logo and product images go to production with the ad; other files stay in this browser.`);
  }
  function removeFile(i: number) {
    files.current = files.current.filter((_, j) => j !== i);
    setUploaded((u) => u.filter((_, j) => j !== i));
  }
  function setRole(i: number, role: BrandRole) {
    // One logo: choosing a new one makes the previous logo a product photo.
    setUploaded((u) => u.map((a, j) => (j === i ? { ...a, role } : role === "logo" && a.role === "logo" ? { ...a, role: "product" } : a)));
  }

  /** W32: write the plan from the storyboard and create one advert per output format, with the facts and brand files. */
  async function produce() {
    const send = uploaded.map((u, i) => ({ u, file: files.current[i] })).filter((x) => x.file && (x.u.role === "logo" || x.u.role === "product"));
    const bad = send.find((x) => brandFileProblem(x.file!));
    if (bad) return toast(`${bad.u.name}: ${brandFileProblem(bad.file!)}. Mark it "browser only" or remove it.`);
    if (send.filter((x) => x.u.role === "product").length > PRODUCT_PHOTOS_MAX) return toast(`At most ${PRODUCT_PHOTOS_MAX} product photos per ad.`);
    setSending(true);
    try {
      if (send.length && !(await signedInUserId())) {
        toast("Sign in to CineForge first (same browser) so your logo and product photos can go with the ad.");
        return;
      }
      if (!(await signedInUserId())) {
        toast("Sign in to CineForge first (same browser) to produce the ad.");
        return;
      }
      // The storyboard is written first when the page still shows the design's concept cards.
      const board = written ? scenes : await writeBoard(analysis, false);
      if (!board) return;
      const brandFiles = send.length ? await uploadBrandFiles(send.map((x) => ({ file: x.file!, role: x.u.role as "logo" | "product" }))) : [];
      const made = await produceAd({
        ...inputs(), scenes: writtenFrom(board), formats: formats.map((f) => ASPECT_OF[f] ?? "16:9"), brandFiles,
        prompt: directorBrief({ ...state, scenes: board }),
      });
      setAdverts(await listAdverts());
      setLiveId(made[0]!.id);
      toast(`Production started: ${made.length} ad${made.length > 1 ? "s" : ""} (${made.map((m) => m.aspect).join(", ")}). Scenes appear here as they are made.`);
      scrollToId("studio");
    } catch (e) {
      toast(e instanceof Error ? e.message : "The ad could not be produced.");
    } finally {
      setSending(false);
    }
  }

  // ── A5: the live advert ────────────────────────────────────────────────
  useEffect(() => {
    void listAdverts().then(setAdverts);
    const q = new URLSearchParams(window.location.search).get("project");
    if (q && /^[0-9a-f-]{36}$/i.test(q)) setLiveId(q);
  }, []);
  const refreshLive = useCallback(async () => {
    if (!liveId) return;
    const [sc, st] = await Promise.all([loadLiveScenes(liveId), loadLiveState(liveId)]);
    setLive(sc);
    setLiveState(st);
    setLiveLoaded(true);
  }, [liveId]);
  useEffect(() => {
    setLive([]);
    setLiveLoaded(false);
    setLiveState(null);
    setLiveSel(0);
    if (!liveId) return;
    void refreshLive();
    const t = setInterval(() => void refreshLive(), 8000);
    return () => clearInterval(t);
  }, [liveId, refreshLive]);
  useEffect(() => {
    const keys = live.map((s) => s.frameKey).filter((k): k is string => !!k && !liveFrames[k]);
    if (!keys.length) return;
    void Promise.all(keys.map(async (k) => [k, await signedUrl(k)] as const)).then((e) =>
      setLiveFrames((f) => ({ ...f, ...Object.fromEntries(e.filter((x): x is readonly [string, string] => !!x[1])) })));
  }, [live, liveFrames]);
  const liveScene = live[liveSel] ?? null;
  useEffect(() => {
    // A newly selected (or first loaded) scene starts from what the live project says — never over the owner's edits.
    if (liveScene && liveScene.id !== liveDraft.for) {
      setLiveDraft({ visual: liveScene.summary, line: liveScene.firstLine ?? liveScene.narration ?? "", seconds: liveScene.durationSec, for: liveScene.id });
    }
  }, [liveScene, liveDraft.for]);

  async function sendLiveEdit() {
    if (!liveScene) return;
    if (!sceneInstructions(liveScene, liveDraft).length) return toast("Nothing in this scene has changed yet.");
    setLiveBusy(true);
    try {
      const n = await reviseLiveScene(liveId, liveScene, liveDraft);
      toast(n > 1 ? "Sent to the Director: the scene revision, and the new length for the Editor." : `Scene ${liveScene.index + 1} sent to the Director.`);
      await refreshLive();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not reach the Director.");
    } finally {
      setLiveBusy(false);
    }
  }
  async function buildPlan() {
    const v = url.trim();
    if (v && !/^https?:\/\//i.test(v)) return toast("Please use a full URL beginning with https:// or http://");
    const cards = await writeBoard();
    if (cards) setModal("plan");
  }
  function exportPlan() {
    const blob = new Blob([JSON.stringify(productionPlan(state), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cineforge-ad-studio-production-brief.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Production brief exported as JSON.");
  }
  function chooseTier(name: string) {
    toast(`${name}: tier selected for discussion. Pricing is not configured yet.`);
    scrollToId("studio");
  }
  function nextScene() {
    const next = (selected + 1) % scenes.length;
    selectScene(next);
    const s = scenes[next]!;
    setHero({ title: s.message, subtitle: `${s.title} · ${s.duration}`, image: s.image });
  }
  function toggleFormat(f: string) {
    setFormats((cur) => {
      const on = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
      return on.length ? FORMATS.filter((x) => on.includes(x)) : [f];
    });
  }

  const modalBody: Record<ModalKind, { kicker: string; title: string; body: ReactNode }> = {
    how: {
      kicker: "HOW IT WORKS", title: "One brief. A complete production plan.",
      body: (<>
        <p>1. Analyse a permitted website and upload brand assets.</p>
        <p>2. Create a structured script, storyboard and scene specifications.</p>
        <p>3. Generate image, video and audio jobs using real CineForge providers.</p>
        <p>4. Assemble approved media, run quality gates and export the master.</p>
        <p><strong>What is connected:</strong> “Analyse” reads one public page on the server and keeps only facts it can quote from it (a link is optional — a brief is enough); “Build my production plan” writes the storyboard from your brief, the page’s facts and your settings; “Produce this ad in CineForge” makes it — one ad per format, with your logo (closing card) and product photos (references for product shots). A produced ad’s scenes can be followed and edited here.</p>
      </>),
    },
    script: {
      kicker: "SCRIPT PREVIEW", title: "Narrative structure",
      body: (<>
        <p><strong>Opening:</strong> Earn attention with a memorable visual.</p>
        <p><strong>Problem:</strong> Show the audience&apos;s need without exaggerating.</p>
        <p><strong>Solution:</strong> Introduce the product with source-backed benefits.</p>
        <p><strong>Demonstration:</strong> Show how it works using authentic assets.</p>
        <p><strong>Outcome:</strong> Make the value concrete.</p>
        <p><strong>Call to action:</strong> End with the brand and approved destination.</p>
      </>),
    },
    timeline: {
      kicker: "ASSEMBLY PLAN", title: "Picture, sound and delivery",
      body: (<>
        <p><strong>Video:</strong> Six editable scene blocks, transitions and a final brand lock-up.</p>
        <p><strong>Voice:</strong> Timed narration with pauses and scene-aligned delivery.</p>
        <p><strong>Audio:</strong> Music bed, effects, ambience, ducking and final loudness check.</p>
        <p><strong>Graphics:</strong> Captions, logo, CTA and format-safe typography.</p>
        <p><strong>QC:</strong> Verify duration, resolution, frame rate, audio presence, A/V sync, readability and file integrity before marking the export complete.</p>
      </>),
    },
    plan: {
      kicker: "PRODUCTION PLAN", title: "Your editable advertisement brief",
      body: (<>
        <p>This preview assembles the current settings, the source facts (when the page was analysed) and the scene plan. No media is generated until you produce the ad in CineForge.</p>
        <pre>{JSON.stringify(productionPlan(state), null, 2)}</pre>
      </>),
    },
  };

  return (
    <div className="cf-ads">
      <div className="shell">
        <header className="topbar">
          <div className="brand"><div className="mark">✦</div><div>CINEFORGE <small>AD STUDIO · CREATIVE AUTOMATION</small></div></div>
          <nav className="nav"><a href="#capabilities">Capabilities</a><a href="#studio">Studio</a><a href="#workflow">Workflow</a><a href="#plans">Plans</a></nav>
          <div className="top-actions"><button className="btn ghost" onClick={() => scrollToId("studio")}>Open Studio</button><button className="btn primary" onClick={() => scrollToId("studio")}>Create an ad ↗</button></div>
        </header>

        <main>
          <section className="hero">
            <div>
              <div className="eyebrow"><span className="pulse" /> From website to finished commercial</div>
              <h1>Your website.<br /><span>One unforgettable ad.</span></h1>
              <p>Turn a website, product page or creative brief into a complete advertisement—planned scene by scene, powered by your brand assets, generated with CineForge media engines, and assembled into one polished film.</p>
              <div className="hero-actions"><button className="btn primary" onClick={() => scrollToId("studio")}>Start creating <span>↗</span></button><button className="btn" onClick={() => setModal("how")}>See how it works ▷</button></div>
              <div className="trustline"><span><b className="tick">✓</b> Your assets stay in the story</span><span><b className="tick">✓</b> Edit any scene</span><span><b className="tick">✓</b> One project, many formats</span></div>
            </div>
            <div className="hero-visual">
              <div className="visual-top"><span>AD STUDIO / PROJECT 001</span><span className="live"><i className="pulse" /> Production canvas</span></div>
              <div className="film-stage" style={{ backgroundImage: `linear-gradient(110deg,rgba(4,9,17,.15),rgba(4,9,17,.7)),url('${unsplash(hero.image, 1200, 85)}')`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <button className="play" aria-label="Preview storyboard" onClick={nextScene}>▶</button>
                <div className="stage-copy"><small>BRAND FILM · CONCEPT PREVIEW</small><strong>{hero.title}</strong><span>{hero.subtitle}</span></div>
              </div>
              <div className="timeline">
                <div className="timeline-head"><span>Multitrack timeline</span><span>00:60 / 16:9</span></div>
                <div className="tracks">
                  <div className="track"><span className="track-label">VIDEO</span><span className="clip gold" /><span className="clip" /><span className="clip purple" /><span className="clip gold" /></div>
                  <div className="track"><span className="track-label">VOICE</span><span className="clip purple" /><span className="clip purple" /><span className="clip purple" /><span className="clip purple" /></div>
                  <div className="track"><span className="track-label">MUSIC</span><span className="clip" /><span className="clip" /><span className="clip" /><span className="clip" /></div>
                </div>
              </div>
              <div className="float-card"><b>Production readiness</b><small>{quality}</small><div className="meter"><i style={meter ? { width: meter } : undefined} /></div></div>
            </div>
          </section>

          <section className="section" id="capabilities">
            <div className="section-head"><div><div className="kicker">Built for the whole story</div><h2>Not another clip generator.<br />A complete ad production studio.</h2></div><p>From the first look at a website to a finished master, each part of the advertisement belongs to one editable project.</p></div>
            <div className="grid3">
              <article className="feature"><div className="ico">⌕</div><h3>Website intelligence</h3><p>Extract products, benefits, audience, brand language and calls to action from accessible pages. Keep claims tied to source evidence.</p></article>
              <article className="feature"><div className="ico">✧</div><h3>Creative direction</h3><p>Build a persuasive concept, script, narrative arc, shot list, visual style and scene-by-scene production brief.</p></article>
              <article className="feature"><div className="ico">▧</div><h3>Your assets + AI</h3><p>Upload logos, real products, photographs, screenshots, PDFs and existing footage. Use them as exact inserts or generation references.</p></article>
              <article className="feature"><div className="ico">▶</div><h3>Scene generation</h3><p>Generate only the missing media through CineForge image and video providers. Review, replace or regenerate individual scenes.</p></article>
              <article className="feature"><div className="ico">♫</div><h3>Voice &amp; sound design</h3><p>Coordinate narration, music, ambience, effects, captions and timing on a shared production timeline.</p></article>
              <article className="feature"><div className="ico">◈</div><h3>Assembly &amp; quality gates</h3><p>Join every approved part into one film, then verify duration, picture, audio, sync, branding and export integrity.</p></article>
            </div>
          </section>

          <section className="section" id="studio">
            <div className="section-head"><div><div className="kicker">Your production workspace</div><h2>Start with a link.<br />Shape every scene.</h2></div><p>Plan the ad here, then produce it in CineForge: the page’s quoted facts, your logo and product photos go with it, and a produced ad’s scenes can be edited and regenerated from this storyboard.</p></div>
            <div className="studio">
              <aside className="panel">
                <h3>New advertisement</h3><p className="sub">Brief your production. CineForge structures the work.</p>
                <div className="field"><label htmlFor="siteUrl">Website or product URL</label><div className="input-wrap"><input id="siteUrl" type="url" placeholder="https://yourcompany.com" value={url} onChange={(e) => { setUrl(e.target.value); if (analysis) setAnalysis(null); }} /><button className="btn" disabled={analysing} onClick={() => void analyseUrl()}>{analysing ? "Reading…" : "Analyse"}</button></div><div className="hint">Use a public page you own or have permission to use. It is fetched once, on our server, to quote its facts (sign-in needed).</div>
                  {analysisError && <div className="error" role="alert">{analysisError}</div>}
                  {analysis && (
                    <>
                      <ul className="facts" aria-label="Source facts">
                        {analysis.facts.map((f, i) => (<li key={i}><b>{FACT_LABEL[f.kind]}</b>{f.statement}<q>{f.quote}</q></li>))}
                      </ul>
                      <div className="hint">
                        {analysis.facts.length ? `Quoted from ${analysis.url}${analysis.method === "extract" ? " (read from the page’s own headings, lists and buttons)" : ""}. The storyboard speaks only these words and your brief.` : `Nothing on ${analysis.url} could be quoted as a fact.`}
                        {analysis.dropped > 0 && ` ${analysis.dropped} proposed fact(s) were dropped: their quote is not on the page.`}
                      </div>
                    </>
                  )}
                </div>
                <div className="field"><label htmlFor="brief">What should this advertisement achieve?</label><textarea id="brief" rows={3} placeholder="Introduce our product, show the main benefits and encourage customers to book a demo..." value={brief} onChange={(e) => setBrief(e.target.value)} /></div>
                <div className="field"><label>Duration</label><div className="chips">{DURATIONS.map((d) => <button key={d.value} className={`chip${duration === d.value ? " active" : ""}`} onClick={() => setDuration(d.value)}>{d.label}</button>)}</div></div>
                <div className="field"><label>Creative direction</label><div className="chips">{STYLES.map((s) => <button key={s.value} className={`chip${style === s.value ? " active" : ""}`} onClick={() => setStyle(s.value)}>{s.label}</button>)}</div></div>
                <div className="field"><label>Production approach</label><div className="segmented">{APPROACHES.map((a) => <button key={a} className={assets === a ? "active" : ""} onClick={() => setAssets(a)}>{a}</button>)}</div></div>
                <div className="field"><label htmlFor="voice">Voice-over</label><select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></div>
                <div className="field"><label>Upload brand materials</label>
                  <label className="upload" htmlFor="assetUpload"><div className="upload-icon">＋</div><strong>Drop files here or browse</strong><small>Logo and product photos (PNG, JPEG, WebP) go into production · other files stay in this browser</small>
                    <input id="assetUpload" type="file" multiple accept="image/*,video/*,.pdf,.svg,.mp3,.wav" onChange={(e) => {
                      addFiles([...(e.target.files ?? [])]);
                      e.target.value = "";
                    }} />
                  </label>
                  <div className="asset-list">{uploaded.map((a, i) => (
                    <span key={`${a.name}-${i}`} className="asset-tag">{a.name}
                      <select aria-label={`How ${a.name} is used`} value={a.role} onChange={(e) => setRole(i, e.target.value as BrandRole)}>
                        <option value="logo" disabled={!!brandFileProblem(a)}>Logo · closing card</option>
                        <option value="product" disabled={!!brandFileProblem(a)}>Product photo · reference</option>
                        <option value="other">Browser only</option>
                      </select>
                      <button aria-label={`Remove ${a.name}`} style={{ border: 0, background: "none", color: "#e9b9a7", cursor: "pointer" }} onClick={() => removeFile(i)}>×</button></span>
                  ))}</div>
                </div>
                <div className="field"><label>Output formats</label><div className="chips">{FORMATS.map((f) => <button key={f} className={`chip${formats.includes(f) ? " active" : ""}`} onClick={() => toggleFormat(f)}>{f}</button>)}</div></div>
                <button className="btn primary" style={{ width: "100%", padding: 14 }} disabled={writing} onClick={() => void buildPlan()}>{writing ? "Writing the storyboard…" : written ? "Rewrite my production plan ↗" : "Build my production plan ↗"}</button>
                <div className="hint">Writes the storyboard from your brief{analysis?.facts.length ? ", the page’s facts" : ""} and settings: every scene’s look and line, ready to edit. Nothing is generated until you produce it.</div>
                <button className="btn" disabled={sending || writing} style={{ display: "block", width: "100%", padding: 14, marginTop: 12, textAlign: "center" }} onClick={() => void produce()}>{sending ? "Starting production…" : "Produce this ad in CineForge ↗"}</button>
                <div className="hint">Produces this storyboard as {formats.length > 1 ? `${formats.length} ads (one per format)` : "one ad"}: scene pictures, video, {voiceMode(voice) === "narrator" ? "voice-over, " : ""}music and sound, assembled into the film{uploaded.some((u) => u.role === "logo") ? " with your logo card" : ""}{uploaded.some((u) => u.role === "product") ? "; your product photos guide the product shots" : ""}. Runs on your CineForge plan (sign-in needed).</div>
              </aside>

              <section className="panel preview-panel">
                <div className="preview-top"><div><h3>Storyboard &amp; scene editor</h3><p className="sub" style={{ margin: "5px 0 0" }}>{liveId ? "A produced ad: edits go to the Director, and only the shots they touch regenerate." : "Select a scene to edit its message and visual direction."}</p></div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <select className="live-select" aria-label="Storyboard" value={liveId} onChange={(e) => setLiveId(e.target.value)}>
                      <option value="">Plan on this page</option>
                      {liveId && !adverts.some((a) => a.id === liveId) && <option value={liveId}>Advert {liveId.slice(0, 8)}</option>}
                      {adverts.map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 40)} · {a.status.toLowerCase()}</option>)}
                    </select>
                    <span className="status">{liveId ? (adverts.find((a) => a.id === liveId)?.status ?? "LIVE") : status}</span>
                  </div>
                </div>
                {liveId ? (
                  <>
                    {!liveLoaded ? <p className="sub">Opening the ad…</p> : live.length === 0 ? (
                      <p className="sub">This ad has no scenes yet: they appear once the Director has planned it (or the ad is not yours).</p>
                    ) : (
                      <>
                        <div className="storyboard">
                          {live.map((sc, i) => (
                            <article key={sc.id} className={`scene${i === liveSel ? " selected" : ""}`}>
                              <div className="scene-img" style={sc.frameKey && liveFrames[sc.frameKey] ? { backgroundImage: `url('${liveFrames[sc.frameKey]}')` } : { background: "#111927" }}><span className="scene-num">Scene {sc.index + 1} · {sc.status.toLowerCase()}</span></div>
                              <div className="scene-body"><b>{sc.heading}</b><small>{sc.summary.slice(0, 110)}</small><div className="scene-actions"><button onClick={() => setLiveSel(i)}>Edit scene ↗</button><span>{Math.round(sc.durationSec)}s · {sc.shots.length} shot{sc.shots.length === 1 ? "" : "s"}</span></div></div>
                            </article>
                          ))}
                        </div>
                        {liveScene && (
                          <div className="selected-scene">
                            <div><label>Scene</label><div className="readonly">{liveScene.index + 1}. {liveScene.heading}</div></div>
                            <div><label htmlFor="liveSeconds">Length (seconds)</label><input id="liveSeconds" type="number" min={2} max={120} value={liveDraft.seconds} onChange={(e) => setLiveDraft({ ...liveDraft, seconds: Number(e.target.value) })} /></div>
                            <div className="wide"><label htmlFor="liveVisual">What the scene shows — its look, light, camera and feel</label><textarea id="liveVisual" value={liveDraft.visual} onChange={(e) => setLiveDraft({ ...liveDraft, visual: e.target.value })} /></div>
                            <div className="wide"><label htmlFor="liveLine">Spoken line</label><input id="liveLine" value={liveDraft.line} onChange={(e) => setLiveDraft({ ...liveDraft, line: e.target.value })} /></div>
                            <div className="wide mini-actions">
                              <button className="btn primary" disabled={liveBusy} onClick={() => void sendLiveEdit()}>{liveBusy ? "Sending…" : "Regenerate this scene"}</button>
                              <a className="btn" style={{ textDecoration: "none" }} href={`/projects/${liveId}/director`}>Director workspace ↗</a>
                              <a className="btn" style={{ textDecoration: "none" }} href={`/projects/${liveId}`}>Production file ↗</a>
                            </div>
                            <div className="wide hint">The Director reads your edit as one change to this scene (look, light, camera, music, its lines) and only the shots it touches are made again; a new length goes to the Editor, who proposes the cut for your approval in the Director workspace. Changes that would break the story are refused with the reason.</div>
                          </div>
                        )}
                      </>
                    )}
                    {liveState && (
                      <ul className="feed" aria-label="The Director's answers and what the ad ran without">
                        {(liveState.chat ?? []).slice(-6).map((m) => (
                          <li key={m.id} className={m.author === "director" ? "director" : undefined}><small>{m.author === "owner" ? (m.status === "pending" ? "You · being read" : "You") : "Director"}</small>{m.body}</li>
                        ))}
                        {liveState.edits.slice(0, 4).map((r) => (
                          <li key={r.id}><small>Change · {r.status}</small>{r.change.kind.replace(/_/g, " ")}{r.status === "applied" ? ` — ${r.affected_shots ?? 0} shot(s) regenerating` : r.status === "rejected" ? ` — ${r.issues.map((x) => x.message).join("; ")}` : r.status === "failed" ? ` — ${r.error ?? ""}` : ""}</li>
                        ))}
                        {liveState.flags.slice(0, 8).map((g) => (
                          <li key={g.id} className="flag"><small>{g.code === "CLAIM_UNSUPPORTED" ? "Unsupported claim" : g.code.replace(/_/g, " ").toLowerCase()}</small>{g.message}</li>
                        ))}
                        {liveState.chat === null && <li><small>Director</small>The Director chat is not available on this database yet (migration 0042).</li>}
                      </ul>
                    )}
                  </>
                ) : (<>
                <div className="storyboard">
                  {scenes.map((s, i) => (
                    <article key={`${i}-${s.beat ?? s.label}`} className={`scene${i === selected ? " selected" : ""}`}>
                      <div className="scene-img" style={{ backgroundImage: `url('${unsplash(s.image, 600, 80)}')` }}><span className="scene-num">{s.label}</span></div>
                      <div className="scene-body"><b>{s.title}</b><small>{s.blurb}</small><div className="scene-actions"><button onClick={() => selectScene(i)}>Edit scene ↗</button><span>{s.span}</span></div></div>
                    </article>
                  ))}
                </div>
                <div className="selected-scene">
                  <div><label htmlFor="sceneTitle">Scene title</label><input id="sceneTitle" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                  <div><label htmlFor="sceneDuration">Target duration</label><input id="sceneDuration" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></div>
                  <div className="wide"><label htmlFor="sceneVisual">Visual direction</label><textarea id="sceneVisual" value={draft.visual} onChange={(e) => setDraft({ ...draft, visual: e.target.value })} /></div>
                  <div className="wide"><label htmlFor="sceneMessage">On-screen message</label><input id="sceneMessage" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></div>
                  <div className="wide mini-actions">
                    <button className="btn" onClick={saveScene}>Save scene edits</button>
                    <button className="btn" onClick={() => sceneUpload.current?.click()}>Add image to this scene</button>
                    <button className="btn" onClick={regenerateScene}>Regenerate scene plan</button>
                    <input ref={sceneUpload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const problem = brandFileProblem(f);
                      if (problem) return toast(`${f.name}: ${problem}.`);
                      // The picture goes to production as a product photo; this scene shows the product.
                      addFiles([f], "product");
                      const preview = URL.createObjectURL(f);
                      setScenes((all) => all.map((s, i) => (i === selected ? { ...s, asset: f.name, image: preview, showProduct: true } : s)));
                      toast(`“${f.name}” added as a product photo: it guides the product shots, and scene ${selected + 1} shows the product.`);
                    }} />
                  </div>
                </div>
                <div className="mini-actions" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                  <button className="btn" onClick={() => setModal("script")}>View full script</button>
                  <button className="btn" onClick={() => setModal("timeline")}>View assembly plan</button>
                  <button className="btn primary" onClick={exportPlan}>Export production brief ↓</button>
                </div>
                </>)}
              </section>
            </div>
          </section>

          <section className="section" id="workflow">
            <div className="section-head"><div><div className="kicker">One connected pipeline</div><h2>From source material to final master.</h2></div><p>The system should do the production work in the right order, validate each stage and avoid rebuilding approved assets unnecessarily.</p></div>
            <div className="steps">
              <div className="step"><span className="n">01 / UNDERSTAND</span><h3>Analyse &amp; verify</h3><p>Read accessible pages, capture source facts, identify audience and flag unsupported claims.</p></div>
              <div className="step"><span className="n">02 / DIRECT</span><h3>Plan the story</h3><p>Compile one structured creative package with script, scenes, shot design and asset requirements.</p></div>
              <div className="step"><span className="n">03 / PRODUCE</span><h3>Generate media</h3><p>Queue image, video, voice and audio jobs through real providers and GPU capacity.</p></div>
              <div className="step"><span className="n">04 / ASSEMBLE</span><h3>Edit the film</h3><p>Build the timeline, mix sound, add captions and adapt approved scenes to selected formats.</p></div>
              <div className="step"><span className="n">05 / VALIDATE</span><h3>Deliver with proof</h3><p>Check artifact existence, duration, resolution, frame rate, audio sync and final export readability.</p></div>
            </div>
          </section>

          <section className="section" id="plans">
            <div className="section-head"><div><div className="kicker">A scalable commercial model</div><h2>Price around production effort.</h2></div><p>Illustrative tiers for product planning only. Final pricing should be set after measuring GPU cost, generation retries, storage and export volume.</p></div>
            <div className="pricing">
              <article className="price-card"><h3>Quick Ad</h3><p>For simple offers and short social campaigns.</p><div className="price">15–30s <small>/ deliverable</small></div><ul><li>Website analysis</li><li>Short script and storyboard</li><li>Limited scene generation</li><li>One primary format</li></ul><button className="btn" style={{ width: "100%" }} onClick={() => chooseTier("Quick Ad")}>Explore tier</button></article>
              <article className="price-card featured"><div className="kicker">MOST FLEXIBLE</div><h3 style={{ marginTop: 8 }}>Campaign Film</h3><p>For complete product stories and brand commercials.</p><div className="price">30–90s <small>/ deliverable</small></div><ul><li>Full creative production plan</li><li>Mixed uploaded and generated assets</li><li>Voice, music and sound design</li><li>Editable scene-by-scene project</li><li>Multiple aspect ratios as configured</li></ul><button className="btn primary" style={{ width: "100%" }} onClick={() => chooseTier("Campaign Film")}>Explore tier</button></article>
              <article className="price-card"><h3>Studio / Agency</h3><p>For teams producing many ads and variants.</p><div className="price">Workflow <small>/ workspace</small></div><ul><li>Brand kits and reusable templates</li><li>Team review and approvals</li><li>Campaign variants and localisation</li><li>Usage metering and cost controls</li></ul><button className="btn" style={{ width: "100%" }} onClick={() => chooseTier("Studio / Agency")}>Explore tier</button></article>
            </div>
          </section>
        </main>
        <footer className="footer"><div><strong style={{ color: "#b7c5d8", letterSpacing: ".08em" }}>CINEFORGE AD STUDIO</strong><br />One source. One story. One finished advertisement.</div><div>Generation runs in CineForge on your plan · the page plan is a preview until produced.<br />© CineForge · Creative production workspace</div></footer>
      </div>
      <div className={`toast${toastOn ? " show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
      <div className={`modal${modal ? " show" : ""}`} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        {modal && (
          <div className="modal-box">
            <div className="modal-head"><div><div className="kicker">{modalBody[modal].kicker}</div><h3>{modalBody[modal].title}</h3></div><button className="close" onClick={() => setModal(null)} aria-label="Close">×</button></div>
            <div>{modalBody[modal].body}</div>
            <div className="mini-actions"><button className="btn" onClick={() => setModal(null)}>Close</button><button className="btn primary" onClick={exportPlan}>Export brief ↓</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
