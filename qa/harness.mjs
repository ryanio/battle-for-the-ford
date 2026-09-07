/**
 * The plumbing behind `node qa/play.mjs`: a static file server, a headless Chromium, and just
 * enough of the Chrome DevTools Protocol to drive the page the way a person does.
 *
 * No npm dependencies on purpose — the game has none either, and a QA rig that needs a lockfile is
 * a QA rig nobody runs. Node ships `fetch` and `WebSocket`; CDP is a JSON-over-WebSocket protocol.
 * That is the whole dependency list.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** Serve `root` on a free port. Returns the origin and a close(). */
export function serve(root) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(base, normalize(path === "/" ? "/index.html" : path));
    if (!file.startsWith(base) || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => {
    server.listen(0, "127.0.0.1", () => {
      ok({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findChrome() {
  for (const c of CHROME_CANDIDATES) if (c && existsSync(c)) return c;
  throw new Error(
    `no Chromium found. Tried:\n  ${CHROME_CANDIDATES.filter(Boolean).join("\n  ")}\nSet $CHROME to override.`,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One page target, driven over CDP. Every method that touches the page goes through here so the
 * scenario file reads like a description of what a player does rather than protocol traffic.
 */
export class Page {
  constructor(ws, chrome, userDataDir) {
    this.ws = ws;
    this.chrome = chrome;
    this.userDataDir = userDataDir;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.width = 1280;
    this.height = 800;
    ws.addEventListener("message", (ev) => this.onMessage(JSON.parse(ev.data)));
  }

  onMessage(msg) {
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      this.pageErrors.push(d.exception?.description || d.text || "exception");
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Run a function in the page and get its (JSON-serialisable) return value back. */
  async eval(fn, ...args) {
    const src = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
    const r = await this.send("Runtime.evaluate", {
      expression: src,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page eval failed: ${d.exception?.description || d.text}`);
    }
    return r.result.value;
  }

  async setViewport(width, height) {
    this.width = width;
    this.height = height;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.eval(() => dispatchEvent(new Event("resize")));
  }

  async goto(url) {
    this.consoleErrors.length = 0;
    this.pageErrors.length = 0;
    await this.send("Page.navigate", { url });
    await this.waitFor(
      () => !!(window.Anchor && window.Anchor.game && window.Anchor.game.units.length),
      15000,
      `game to boot at ${url}`,
    );
  }

  /** Poll a predicate that runs in the page. */
  async waitFor(fn, timeout = 8000, what = "condition") {
    const deadline = Date.now() + timeout;
    for (;;) {
      let ok = false;
      try {
        ok = await this.eval(fn);
      } catch {
        ok = false;
      }
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await sleep(80);
    }
  }

  // ── genuine input ──────────────────────────────────────────────────────────
  mouse(type, x, y, button = "none", extra = {}) {
    return this.send("Input.dispatchMouseEvent", {
      type,
      x: Math.round(x),
      y: Math.round(y),
      button,
      buttons: extra.buttons ?? (button === "left" ? 1 : button === "right" ? 2 : 0),
      clickCount: type === "mouseMoved" ? 0 : 1,
      pointerType: "mouse",
      ...extra,
    });
  }

  async moveTo(x, y) {
    await this.mouse("mouseMoved", x, y);
  }

  /** Press, drag through intermediate points so pointermove actually fires, release. */
  async dragWith(button, x1, y1, x2, y2, steps = 8) {
    const buttons = button === "left" ? 1 : 2;
    await this.mouse("mouseMoved", x1, y1);
    await this.mouse("mousePressed", x1, y1, button, { buttons });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.mouse("mouseMoved", x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, button, { buttons });
      await sleep(12);
    }
    await this.mouse("mouseReleased", x2, y2, button, { buttons: 0 });
    await sleep(60);
  }

  async click(x, y, button = "left") {
    await this.mouse("mouseMoved", x, y);
    await this.mouse("mousePressed", x, y, button);
    await sleep(25);
    await this.mouse("mouseReleased", x, y, button, { buttons: 0 });
    await sleep(60);
  }

  async clickSelector(sel) {
    const box = await this.eval((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, sel);
    if (!box || box.w === 0) throw new Error(`cannot click ${sel}: not visible`);
    await this.click(box.x, box.y);
    return box;
  }

  async wheel(x, y, deltaY) {
    await this.mouse("mouseMoved", x, y);
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: Math.round(x),
      y: Math.round(y),
      deltaX: 0,
      deltaY,
      button: "none",
      buttons: 0,
      pointerType: "mouse",
    });
    await sleep(80);
  }

  async key(key, { code, vk, hold = 60 } = {}) {
    const shape = KEYS[key] || { code: `Key${key.toUpperCase()}`, vk: key.toUpperCase().charCodeAt(0) };
    const base = { key, code: code || shape.code, windowsVirtualKeyCode: vk ?? shape.vk, nativeVirtualKeyCode: vk ?? shape.vk };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    if (key.length === 1 && key !== " ") await this.send("Input.dispatchKeyEvent", { type: "char", text: key, ...base });
    await sleep(hold);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(40);
  }

  /** Hold a key down for `ms` — how you actually pan a camera. */
  async holdKey(key, ms) {
    const shape = KEYS[key] || { code: `Key${key.toUpperCase()}`, vk: key.toUpperCase().charCodeAt(0) };
    const base = { key, code: shape.code, windowsVirtualKeyCode: shape.vk, nativeVirtualKeyCode: shape.vk };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await sleep(ms);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(50);
  }

  async shot(name, dir) {
    const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const { writeFile } = await import("node:fs/promises");
    const file = join(dir, `${name}.png`);
    await writeFile(file, Buffer.from(r.data, "base64"));
    return file;
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
    this.chrome.kill("SIGKILL");
    await sleep(150);
    await rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

const KEYS = {
  " ": { code: "Space", vk: 32 },
  Tab: { code: "Tab", vk: 9 },
  Escape: { code: "Escape", vk: 27 },
  Enter: { code: "Enter", vk: 13 },
};

/** Boot headless Chromium and attach to its first page target. */
export async function launch({ width = 1280, height = 800, url = "about:blank" } = {}) {
  const bin = findChrome();
  const port = 9000 + Math.floor(Math.random() * 900);
  const userDataDir = join(process.env.TMPDIR || "/tmp", `bftf-qa-${process.pid}-${port}`);
  await mkdir(userDataDir, { recursive: true });
  const chrome = spawn(
    bin,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      `--window-size=${width},${height}`,
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${port}`,
      url,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  chrome.stderr.on("data", (b) => {
    stderr += b.toString();
  });

  // The debugging port is not open the instant the process is.
  let target = null;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`chromium exited early:\n${stderr}`);
    await sleep(120);
  }
  if (!target) throw new Error(`chromium never opened a page target:\n${stderr}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", () => bad(new Error("CDP websocket failed")), { once: true });
  });

  const page = new Page(ws, chrome, userDataDir);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.setViewport(width, height);
  return page;
}

// ── the scoreboard ───────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

export class Report {
  constructor() {
    this.failures = [];
    this.passes = 0;
    this.section = "";
  }

  step(name) {
    this.section = name;
    console.log(`\n${DIM}── ${name}${OFF}`);
  }

  check(name, ok, detail = "") {
    if (ok) {
      this.passes++;
      console.log(`  ${GREEN}pass${OFF} ${name}${detail ? ` ${DIM}${detail}${OFF}` : ""}`);
    } else {
      this.failures.push(`[${this.section}] ${name}${detail ? ` — ${detail}` : ""}`);
      console.log(`  ${RED}FAIL${OFF} ${name}${detail ? ` ${RED}${detail}${OFF}` : ""}`);
    }
    return ok;
  }

  equal(name, actual, expected) {
    return this.check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }

  finish() {
    console.log("");
    if (!this.failures.length) {
      console.log(`${GREEN}${this.passes} checks passed${OFF}`);
      return 0;
    }
    console.log(`${RED}${this.failures.length} failed${OFF}, ${this.passes} passed:`);
    for (const f of this.failures) console.log(`  ${RED}·${OFF} ${f}`);
    return 1;
  }
}

export { sleep };
