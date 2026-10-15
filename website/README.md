# ReceptionBench community site

A buildless static site. No install step, server application, telemetry, third-party fonts or external API is used. All diagrams and evidence examples are authored simulations, not benchmark results. Nothing in the participation form leaves the browser; it generates a downloadable text brief. The site does not read or write browser storage.

Preview from the repository root:

```sh
npm run site:preview
```

Open http://127.0.0.1:4173. ES modules require HTTP; opening index.html as a file is not supported. Stop the preview with Ctrl-C. If 4173 is occupied, use `python3 -m http.server 4174 --bind 127.0.0.1 --directory website` and open port 4174 instead. The website itself requires no benchmark dependencies. Run `npm test` from the repository root to include its data and content checks with the existing suite.

Files: `index.html` contains the accessible baseline, `styles.css` the responsive layout, `model.mjs` the explicitly simulated examples and brief generation, and `app.mjs` the browser interactions. Without JavaScript, the first example, methodology, quickstart and general brief download remain available. No results are loaded from or sent to a server.

## Public release configuration

Use [pmannle/receptionbench](https://github.com/pmannle/receptionbench) issues for contribution proposals and participation briefs. `config.mjs` contains those confirmed destinations; the HTML also exposes useful links without JavaScript. The site never submits a brief automatically. The repository uses Apache-2.0 for code/documentation/website and CC0-1.0 for independently authored synthetic fixture/scenario data; see the root licenses and provenance notice.

Cloudflare hosting at its default URL is authorized, with a custom domain deferred. This source README does not assert that a Git push or deployment has succeeded. Hosting/release automation is handled separately. For static hosting, serve this directory as the web root; no build command or backend is needed. Keep evidence simulations labelled even after real results become available.

For QA, check the three evidence outcomes, keyboard navigation and Escape behavior in the mobile menu, command copying (including denied clipboard fallback), brief downloads and narrow layouts. Check the public destination links when release configuration changes.

## Verification recorded for this slice

Six focused tests cover simulated verdict coverage, tailored brief requirements, static content/anchor constraints, the maintained general brief, confirmed participation destinations and source-neutral publication/license boundaries. Module syntax checks pass. Native Brave QA inspected desktop and a 412 × 914 device viewport, switched between all three case outcomes, verified command-copy success, triggered the tailored brief save dialog and verified mobile navigation closes after selection. No console messages were present during inspection. The save dialog was cancelled to avoid placing a test file in the user's download folders; generated brief content is covered by the data tests. This is responsive smoke testing, not a full accessibility audit or cross-browser certification. The owned preview server was stopped after QA.
