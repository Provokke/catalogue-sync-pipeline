export class RobotsDisallowed extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowed";
  }
}

export interface PoliteOptions {
  minDelayMs: number;
  fetch?: typeof fetch;
  userAgent?: string;
  /** Injectable for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Rule {
  allow: boolean;
  path: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

const lastRequestAt = new Map<string, number>();
const robotsCache = new Map<string, Rule[] | "deny-all">();

export function parseRobots(txt: string, agent: string): Rule[] {
  const groups: Group[] = [];
  let cur: Group | undefined;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*([^#]*?)\s*(#.*)?$/.exec(line);
    if (!m) continue;
    const key = (m[1] ?? "").toLowerCase();
    const val = m[2] ?? "";
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow") && val !== "") {
        cur.rules.push({ allow: key === "allow", path: val });
      }
    }
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

/** Longest matching rule wins; on a tie Allow beats Disallow; no match means allowed. */
function allowed(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | undefined;
  for (const r of rules) {
    if (!pathAndQuery.startsWith(r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export async function fetchPolite(url: string, opts: PoliteOptions): Promise<string> {
  const doFetch = opts.fetch ?? fetch;
  const ua = opts.userAgent ?? "catalogue-sync-bot";
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const u = new URL(url);

  const request = async (target: string): Promise<Response> => {
    const last = lastRequestAt.get(u.host);
    if (last !== undefined) {
      const wait = opts.minDelayMs - (now() - last);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt.set(u.host, now());
    return doFetch(target, { headers: { "user-agent": ua } });
  };

  let rules = robotsCache.get(u.origin);
  if (!rules) {
    const res = await request(`${u.origin}/robots.txt`);
    if (res.ok) rules = parseRobots(await res.text(), ua);
    else if (res.status >= 400 && res.status < 500) rules = [];
    else rules = "deny-all"; // robots unreachable (5xx): be conservative
    robotsCache.set(u.origin, rules);
  }
  if (rules === "deny-all" || !allowed(rules, u.pathname + u.search)) throw new RobotsDisallowed(url);

  const res = await request(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  return res.text();
}

/** Forget cached robots rules and per-host timing (tests, long-lived processes). */
export function resetFetcherState(): void {
  lastRequestAt.clear();
  robotsCache.clear();
}
