"use client";

/**
 * CineForge Ads Studio — the uploaded design (docs/design/cineforge_ad_studio.html) as a
 * CineForge page: same copy, same images, same layout and behaviour, styles
 * scoped under .cf-ads. One addition: "Produce this ad in CineForge" hands
 * the brief to the real Advert studio (/create/advert), where it is planned
 * and filmed by the production pipeline.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AD_SCENES, handoffHref, productionPlan, unsplash, type AdScene, type AdStudioState } from "../../lib/ads-studio";

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
  const [uploaded, setUploaded] = useState<{ name: string; size: number; type: string }[]>([]);
  const [status, setStatus] = useState("CONCEPT PREVIEW");
  const [quality, setQuality] = useState("Storyboard preview");
  const [meter, setMeter] = useState<string | undefined>(undefined);
  const [hero, setHero] = useState({ title: "Make your story matter.", subtitle: "Concept → scenes → final film", image: AD_SCENES[0]!.image });
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneUpload = useRef<HTMLInputElement>(null);

  const state: AdStudioState = { url, brief, duration, style, assets, voice, formats, uploaded, scenes };

  function toast(msg: string) {
    setToastMsg(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 3000);
  }
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

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
    setScenes((all) => all.map((s, i) => (i === selected ? { ...s, ...draft, blurb: draft.visual } : s)));
    toast("Scene edits saved to this prototype project.");
  }
  function regenerateScene() {
    const visual = "REVISED PLAN: " + draft.visual + " Preserve brand identity, use source-backed claims, and maintain continuity with neighbouring scenes.";
    setDraft((d) => ({ ...d, visual }));
    setScenes((all) => all.map((s, i) => (i === selected ? { ...s, visual } : s)));
    toast("Demo revision added. Live regeneration needs the CineForge API.");
  }
  function analyseUrl() {
    const v = url.trim();
    if (!v) return toast("Enter a website URL first.");
    try {
      const u = new URL(v);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      toast("URL format looks valid. Live website analysis requires a connected backend.");
      setStatus("URL READY");
    } catch {
      toast("Enter a valid http:// or https:// URL.");
    }
  }
  function buildPlan() {
    const v = url.trim();
    if (v && !/^https?:\/\//i.test(v)) return toast("Please use a full URL beginning with https:// or http://");
    setStatus("PLAN PREVIEW");
    setQuality("Plan ready · generation not connected");
    setMeter("38%");
    const b = brief.trim();
    if (b) {
      const message = b.length > 62 ? b.slice(0, 59) + "…" : b;
      setScenes((all) => all.map((s, i) => (i === 0 ? { ...s, message } : s)));
      if (selected === 0) setDraft((d) => ({ ...d, message }));
    }
    toast("Production brief prepared locally. No media jobs were submitted.");
    setModal("plan");
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
        <p><strong>This interface is a front-end concept:</strong> live site crawling, generation and final rendering need backend integrations.</p>
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
        <p>This browser-only preview has assembled the current project settings and scene plan. It has not crawled the URL or generated any media.</p>
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
            <div className="section-head"><div><div className="kicker">Your production workspace</div><h2>Start with a link.<br />Shape every scene.</h2></div><p>This interactive concept demonstrates the Ad Studio workflow. Generation controls are a front-end prototype until connected to live CineForge services.</p></div>
            <div className="studio">
              <aside className="panel">
                <h3>New advertisement</h3><p className="sub">Brief your production. CineForge structures the work.</p>
                <div className="field"><label htmlFor="siteUrl">Website or product URL</label><div className="input-wrap"><input id="siteUrl" type="url" placeholder="https://yourcompany.com" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn" onClick={analyseUrl}>Analyse</button></div><div className="hint">Use a public page you own or have permission to use.</div></div>
                <div className="field"><label htmlFor="brief">What should this advertisement achieve?</label><textarea id="brief" rows={3} placeholder="Introduce our product, show the main benefits and encourage customers to book a demo..." value={brief} onChange={(e) => setBrief(e.target.value)} /></div>
                <div className="field"><label>Duration</label><div className="chips">{DURATIONS.map((d) => <button key={d.value} className={`chip${duration === d.value ? " active" : ""}`} onClick={() => setDuration(d.value)}>{d.label}</button>)}</div></div>
                <div className="field"><label>Creative direction</label><div className="chips">{STYLES.map((s) => <button key={s.value} className={`chip${style === s.value ? " active" : ""}`} onClick={() => setStyle(s.value)}>{s.label}</button>)}</div></div>
                <div className="field"><label>Production approach</label><div className="segmented">{APPROACHES.map((a) => <button key={a} className={assets === a ? "active" : ""} onClick={() => setAssets(a)}>{a}</button>)}</div></div>
                <div className="field"><label htmlFor="voice">Voice-over</label><select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></div>
                <div className="field"><label>Upload brand materials</label>
                  <label className="upload" htmlFor="assetUpload"><div className="upload-icon">＋</div><strong>Drop files here or browse</strong><small>Logo, product images, video, PDF, screenshots · prototype file selection</small>
                    <input id="assetUpload" type="file" multiple accept="image/*,video/*,.pdf,.svg,.mp3,.wav" onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      setUploaded((u) => [...u, ...files.map((f) => ({ name: f.name, size: f.size, type: f.type }))]);
                      toast(`${files.length} file(s) added to this browser session.`);
                    }} />
                  </label>
                  <div className="asset-list">{uploaded.map((a, i) => (
                    <span key={`${a.name}-${i}`} className="asset-tag">{a.name} <button aria-label={`Remove ${a.name}`} style={{ border: 0, background: "none", color: "#e9b9a7", cursor: "pointer" }} onClick={() => setUploaded((u) => u.filter((_, j) => j !== i))}>×</button></span>
                  ))}</div>
                </div>
                <div className="field"><label>Output formats</label><div className="chips">{FORMATS.map((f) => <button key={f} className={`chip${formats.includes(f) ? " active" : ""}`} onClick={() => toggleFormat(f)}>{f}</button>)}</div></div>
                <button className="btn primary" style={{ width: "100%", padding: 14 }} onClick={buildPlan}>Build my production plan ↗</button>
                <div className="hint">No media is generated by this demo. The plan preview is created locally in your browser.</div>
                <Link className="btn" style={{ display: "block", width: "100%", padding: 14, marginTop: 12, textAlign: "center", textDecoration: "none" }} href={handoffHref(state)}>Produce this ad in CineForge ↗</Link>
                <div className="hint">Opens the Advert studio with this brief, length and format. There the film is planned and generated on your plan.</div>
              </aside>

              <section className="panel preview-panel">
                <div className="preview-top"><div><h3>Storyboard &amp; scene editor</h3><p className="sub" style={{ margin: "5px 0 0" }}>Select a scene to edit its message and visual direction.</p></div><span className="status">{status}</span></div>
                <div className="storyboard">
                  {scenes.map((s, i) => (
                    <article key={s.image} className={`scene${i === selected ? " selected" : ""}`}>
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
                    <input ref={sceneUpload} type="file" accept="image/*,video/*" hidden onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setScenes((all) => all.map((s, i) => (i === selected ? { ...s, asset: f.name } : s)));
                      toast(`“${f.name}” attached to scene ${selected + 1} in this session.`);
                    }} />
                  </div>
                </div>
                <div className="mini-actions" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                  <button className="btn" onClick={() => setModal("script")}>View full script</button>
                  <button className="btn" onClick={() => setModal("timeline")}>View assembly plan</button>
                  <button className="btn primary" onClick={exportPlan}>Export production brief ↓</button>
                </div>
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
        <footer className="footer"><div><strong style={{ color: "#b7c5d8", letterSpacing: ".08em" }}>CINEFORGE AD STUDIO</strong><br />One source. One story. One finished advertisement.</div><div>Concept UI · Live media generation requires connected CineForge services.<br />© CineForge · Creative production workspace</div></footer>
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
