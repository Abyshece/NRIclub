// Ambassador coverage, at the top of Ambassadors in the admin panel: how
// many of Germany's university cities (src/content/universityCities.js)
// have a city ambassador, by state; the cities that have one, with their
// ambassadors; and the ones that still need one, the most Indian students
// first, with the open applications for each. A search and a state filter
// narrow both lists. Ambassadors whose city isn't on the list show
// separately.
// The ambassadors come from useAmbassadorTeam (public.admin_ambassador_activity:
// since when, and whether they accepted the agreement); before the database
// update of 27 October 2026, only who and where, from their profiles. Open
// applications (new or contacted) come from public.admin_ambassador_applications.
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../supabaseApi";
import { MemberName } from "./AmbassadorTeam";
import { ErrorNote, Icon, Pill, SectionTitle, SkeletonRows } from "./ui";
import { formatDate, friendlyError } from "./format";
import { STATES, UNIVERSITY_CITIES, byPriority, universityCity } from "../content/universityCities";
import { slug } from "../content/slug";

const PAGE = 20;
const APPLICATION_PAGES = 10; // of 200: more open applications than that is unlikely
const n = (x) => Number(x || 0).toLocaleString("en-GB");

// Applications for a city in Germany (the form has a list of countries).
const inGermany = (app) => ["germany", "deutschland"].includes(slug(app.country));

// The city on the list an application is for, or null.
export const applicationCity = (app) => (inGermany(app) ? universityCity(app.city) : null);

// All open applications (new and contacted): { apps (null before the
// database update of 24 October 2026), missing, error, reload, patch }.
// patch(application): our team's change to one, as the server returned it
// (it stays in the list with its new status until the next reload, as in
// the list of applications; only new and contacted ones count as open).
export function useOpenApplications() {
  const [state, setState] = useState({ apps: null, missing: false, error: "" });
  const load = useCallback(async () => {
    try {
      const all = [];
      for (let page = 0; page < APPLICATION_PAGES; page += 1) {
        const res = await api.adminAmbassadorApplications({ status: "open", limit: 200, offset: all.length });
        if (!res) { setState({ apps: null, missing: true, error: "" }); return; }
        const got = res.applications || [];
        all.push(...got);
        if (!got.length || all.length >= (res.total || 0)) break;
      }
      setState({ apps: all, missing: false, error: "" });
    } catch (e) {
      setState((s) => ({ ...s, error: `Couldn't load the open applications: ${friendlyError(e)}` }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const patch = useCallback((updated) => {
    setState((s) => (s.apps ? { ...s, apps: s.apps.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) } : s));
  }, []);
  return { ...state, reload: load, patch };
}

const isOpen = (app) => app.status === "new" || app.status === "contacted";

// "2,526 Indian students", "about 1,600", "more than 2,200".
function IndianStudents({ city }) {
  if (!city.indianStudents) return null;
  const count = `${city.indianEstimate ? "about " : city.indianAtLeast ? "more than " : ""}${n(city.indianStudents)}`;
  return <Pill tone="indigo" dot={false} title={city.indianNote}>{count} Indian students</Pill>;
}

// " · Bavaria" after a city's name (not for Berlin, Hamburg and Bremen).
const stateOf = (c) => (STATES[c.state] === c.city ? null : <> <span className="adm-faint">· {STATES[c.state]}</span></>);

const matches = (city, q) => !q || [city.city, STATES[city.state], ...city.universities].some((t) => t.toLowerCase().includes(q));

// team: from useAmbassadorTeam. open: from useOpenApplications.
// onOpenMember({ id, name }): opens the member under Members.
// onShowApplications(city): shows the open applications for a city (an
// entry of UNIVERSITY_CITIES).
export default function AmbassadorCoverage({ team, open, onOpenMember, onShowApplications }) {
  const [query, setQuery] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [query, stateCode]);

  const { activity, profiles } = team;
  const full = !!activity;

  // The ambassadors by city on the list, and the others.
  const { byCity, others } = useMemo(() => {
    const list = activity ? activity.ambassadors : (profiles || []).map((p) => ({ id: p.id, name: p.name, city: p.ambassador_city }));
    const map = new Map();
    const rest = new Map(); // slug -> [city as the first one has it, ambassadors]
    for (const a of list) {
      const c = universityCity(a.city);
      if (c) map.set(c.city, [...(map.get(c.city) || []), a]);
      else {
        const key = slug(a.city);
        const [city, those] = rest.get(key) || [a.city, []];
        rest.set(key, [city, [...those, a]]);
      }
    }
    return { byCity: map, others: [...rest.values()].sort((x, y) => x[0].localeCompare(y[0], "en")) };
  }, [activity, profiles]);

  // Open applications by city on the list.
  const appsByCity = useMemo(() => {
    const map = new Map();
    for (const app of open.apps || []) {
      const c = isOpen(app) ? applicationCity(app) : null;
      if (c) map.set(c.city, (map.get(c.city) || 0) + 1);
    }
    return map;
  }, [open.apps]);

  const byState = useMemo(() => Object.keys(STATES).map((code) => {
    const cities = UNIVERSITY_CITIES.filter((c) => c.state === code);
    return { code, total: cities.length, covered: cities.filter((c) => byCity.has(c.city)).length };
  }), [byCity]);

  if (!activity && !profiles) {
    if (team.error) return null; // the error shows under City ambassadors
    return <section aria-label="Ambassador coverage"><SectionTitle>Ambassador coverage in Germany</SectionTitle><SkeletonRows rows={2} /></section>;
  }

  const total = UNIVERSITY_CITIES.length;
  const covered = UNIVERSITY_CITIES.filter((c) => byCity.has(c.city)).length;
  const q = query.trim().toLowerCase();
  const fits = (c) => (!stateCode || c.state === stateCode)
    && (matches(c, q) || (byCity.get(c.city) || []).some((a) => String(a.name || "").toLowerCase().includes(q)));
  const anyFits = UNIVERSITY_CITIES.some(fits);
  const narrowed = !!(q || stateCode);
  const coveredList = UNIVERSITY_CITIES.filter((c) => byCity.has(c.city) && fits(c)).sort((a, b) => a.city.localeCompare(b.city, "en"));
  const needed = UNIVERSITY_CITIES.filter((c) => !byCity.has(c.city) && fits(c)).sort(byPriority);
  const otherList = stateCode ? [] : others.filter(([city, list]) => !q || city.toLowerCase().includes(q)
    || list.some((a) => String(a.name || "").toLowerCase().includes(q)));
  const inState = stateCode ? byState.find((s) => s.code === stateCode) : null;
  const pct = total ? Math.round((covered / total) * 100) : 0;

  const applications = (c) => {
    if (!open.apps) return null;
    const count = appsByCity.get(c.city) || 0;
    if (!count) return <span className="adm-faint">No open applications</span>;
    return (
      <button type="button" className="adm-link" onClick={() => onShowApplications?.(c)}>
        {count} open application{count === 1 ? "" : "s"}
      </button>
    );
  };

  return (
    <section aria-label="Ambassador coverage">
      <SectionTitle>Ambassador coverage in Germany</SectionTitle>
      <div className="adm-cov">
        <div className="adm-cov-head">
          <span className="adm-cov-big" data-coverage-headline>{covered} of {total} university cities have an ambassador</span>
          {inState && <span className="adm-muted">In {STATES[inState.code]}: {inState.covered} of {inState.total}</span>}
        </div>
        <div className="adm-cov-bar" role="progressbar" aria-label="University cities with an ambassador"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={covered} aria-valuetext={`${covered} of ${total}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="adm-cov-states" role="group" aria-label="By state">
          {byState.map((s) => (
            <button key={s.code} type="button" aria-pressed={stateCode === s.code} data-state={s.code}
              className={`adm-cov-state${s.covered === s.total ? " is-all" : s.covered ? " is-some" : ""}`}
              onClick={() => setStateCode((v) => (v === s.code ? "" : s.code))}
              title={`${STATES[s.code]}: ${s.covered} of ${s.total} university cities have an ambassador`}>
              <span className="adm-cov-state-name">{STATES[s.code]}</span>
              <span className="adm-cov-state-count">{s.covered}/{s.total}</span>
            </button>
          ))}
        </div>
        {!full && (
          <p className="adm-muted adm-small" style={{ marginTop: 10 }}>
            Since when, and whether they accepted the ambassador agreement, show once the database update of 27 October 2026 (20261027000000_ambassador_panel.sql) is in.
          </p>
        )}
      </div>

      <div className="adm-toolbar" style={{ marginTop: 14 }}>
        <label className="adm-search">
          <Icon name="search" size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cities or universities"
            aria-label="Search cities or universities" />
        </label>
        <select className="adm-select" style={{ width: "auto", minWidth: 0, maxWidth: "100%" }} value={stateCode}
          onChange={(e) => setStateCode(e.target.value)} aria-label="State">
          <option value="">All states</option>
          {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>
      {open.error && <ErrorNote onRetry={open.reload}>{open.error}</ErrorNote>}

      <div className="adm-cov-lists">
        <div className="adm-cov-list" aria-label="Covered" role="region">
          <div className="adm-cov-list-head is-covered">Covered <span className="adm-cov-count">{coveredList.length}</span></div>
          {coveredList.length === 0 && (
            <div className="adm-cov-city adm-muted">
              {!anyFits ? "No city fits the search." : narrowed ? "None of these cities has an ambassador yet." : "No university city has an ambassador yet."}
            </div>
          )}
          {coveredList.map((c) => (
            <div key={c.city} className="adm-cov-city" data-city={c.city}>
              <div><span className="adm-cov-city-name">{c.city}</span>{stateOf(c)}</div>
              {byCity.get(c.city).map((a) => (
                <div key={a.id} className="adm-cov-meta">
                  <MemberName member={a} onOpenMember={onOpenMember} />
                  {a.since && <span className="adm-muted">since {formatDate(a.since)}</span>}
                  {full
                    ? (a.current
                      ? <Pill tone="green">Agreement accepted</Pill>
                      : <Pill tone="orange">Agreement not accepted</Pill>)
                    : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="adm-cov-list" aria-label="Still needed" role="region">
          <div className="adm-cov-list-head is-needed">Still needed <span className="adm-cov-count">{needed.length}</span></div>
          {needed.length === 0 && (
            <div className="adm-cov-city adm-muted">
              {!anyFits ? "No city fits the search." : narrowed ? "Each of these cities has an ambassador." : "Every university city has an ambassador."}
            </div>
          )}
          {needed.slice(0, shown).map((c) => (
            <div key={c.city} className="adm-cov-city" data-city={c.city}>
              <div><span className="adm-cov-city-name">{c.city}</span>{stateOf(c)}</div>
              <div className="adm-muted" style={{ marginTop: 2 }}>{c.universities.join(" · ")}</div>
              <div className="adm-cov-meta">
                <IndianStudents city={c} />
                {applications(c)}
              </div>
              {c.indianNote && (
                <div className="adm-faint adm-small" style={{ marginTop: 2 }}>
                  {c.indianNote}{c.indianEstimate ? "; an estimate" : ""}
                </div>
              )}
            </div>
          ))}
          {needed.length > shown && (
            <div className="adm-cov-city">
              <button type="button" className="adm-link" onClick={() => setShown((v) => v + PAGE)}>
                Show {Math.min(PAGE, needed.length - shown)} more of {needed.length}
              </button>
            </div>
          )}
        </div>
      </div>

      {otherList.length > 0 && (
        <div className="adm-cov-list" style={{ marginTop: 16 }} aria-label="Other cities with an ambassador" role="region">
          <div className="adm-cov-list-head is-other">Other cities with an ambassador <span className="adm-cov-count">{otherList.length}</span></div>
          {otherList.map(([city, list]) => (
            <div key={city} className="adm-cov-city" data-city={city}>
              <span className="adm-cov-city-name">{city}</span>
              <div className="adm-cov-meta">
                {list.map((a) => (
                  <span key={a.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <MemberName member={a} onOpenMember={onOpenMember} />
                    {a.since && <span className="adm-muted">since {formatDate(a.since)}</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="adm-faint adm-small" style={{ marginTop: 10 }}>
        Indian students: each university's own figure, the latest it published (a few are estimates). Universities with campuses in many cities, such as IU, publish none by city, so they aren't counted. The list is src/content/universityCities.js.
      </p>
    </section>
  );
}
