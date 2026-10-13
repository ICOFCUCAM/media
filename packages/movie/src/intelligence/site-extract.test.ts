import { describe, expect, it } from "vitest";
import { extractSite, siteImages } from "./site-extract";
import { htmlToText } from "./site-fetch";
import { verifyFacts } from "./site";

const HTML = `<!doctype html><html><head>
<title>Flyttgo | Moving made simple</title>
<meta name="description" content="Flyttgo connects van owners with people who need things moved. Book in two minutes.">
<meta property="og:site_name" content="Flyttgo">
<meta property="og:image" content="/img/share.jpg">
<link rel="apple-touch-icon" href="/icon-180.png">
</head><body>
<nav><a href="/">Home</a><a href="/about">About</a><a href="/login">Log in</a></nav>
<main>
<h1>Moving, without the heavy lifting</h1>
<p>Flyttgo is the easiest way to move a sofa, a flat or a whole office.</p>
<h2>Vetted drivers in every city</h2>
<ul><li>Track your van live on the map</li><li>Fixed price before you book</li><li>Contact</li></ul>
<p>Built for busy families and small businesses that need a hand.</p>
<img src="/img/van.jpg" alt="A Flyttgo van" width="800" height="500">
<img src="/img/logo.png" alt="Flyttgo logo">
<img src="/px.gif" width="1" height="1">
<a class="btn" href="/book">Book a move</a>
</main>
<footer><a href="/privacy">Privacy policy</a></footer>
</body></html>`;

describe("website reading without a model (W32)", () => {
  const site = extractSite(HTML, "https://flyttgo.example/");

  it("reads product, benefits, audience and the call to action from the page's own words", () => {
    const kinds = site.facts.map((f) => f.kind);
    expect(kinds).toContain("product");
    expect(site.facts.find((f) => f.kind === "product")!.quote).toBe("Flyttgo connects van owners with people who need things moved.");
    const benefits = site.facts.filter((f) => f.kind === "benefit").map((f) => f.quote);
    expect(benefits).toEqual(expect.arrayContaining(["Vetted drivers in every city", "Track your van live on the map", "Fixed price before you book"]));
    expect(benefits).not.toContain("Contact");
    expect(site.facts.find((f) => f.kind === "audience")?.quote).toMatch(/Built for busy families/);
    expect(site.facts.find((f) => f.kind === "call_to_action")?.quote).toBe("Book a move");
    expect(site.brand).toBe("Flyttgo");
  });

  it("every fact passes the same quote check a model's facts must pass", () => {
    const { text } = htmlToText(HTML);
    const v = verifyFacts({ facts: site.facts }, text);
    expect(v.dropped).toEqual([]);
    expect(v.facts.length).toBe(site.facts.length);
  });

  it("keeps the page's pictures and a logo, never pixels", () => {
    expect(site.images).toEqual(["https://flyttgo.example/img/share.jpg", "https://flyttgo.example/img/van.jpg"]);
    expect(site.logo).toBe("https://flyttgo.example/img/logo.png");
    expect(siteImages("<link rel=\"icon\" href=\"/f.png\">", "https://a.example/x").logo).toBe("https://a.example/f.png");
  });

  it("a page with no copy yields no facts rather than invented ones", () => {
    expect(extractSite("<html><body><div></div></body></html>", "https://a.example/").facts).toEqual([]);
  });
});
