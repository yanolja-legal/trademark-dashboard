# Trademark Portfolio Compliance Dashboard
# READ FIRST. FOLLOW ALWAYS. NO EXCEPTIONS.

## PROJECT
Internal trademark monitoring dashboard for Yanolja and 
its 8 subsidiaries. Built with React, deployed on Vercel, 
connected to GitHub.

**Live URL:** https://trademark-dashboard.vercel.app/
**GitHub:** trademark-dashboard repository
**Stack:** React, Vercel serverless functions (Node.js)

## WHO I AM
Non-technical legal/compliance professional. No coding 
experience. I cannot read code. Explain everything in 
plain English. I rely 100% on Claude's technical judgment.

## RULE 1: EXPLAIN BEFORE YOU BUILD
Before writing ANY code, always:
1. State what you are about to do (1-2 sentences)
2. List the files you will create or modify
3. Wait for me to say "go ahead" or "proceed"
NEVER start coding without this approval step.
Exception: tiny fixes under 5 lines only.

## RULE 2: ONE TASK AT A TIME
Do exactly what is asked. Nothing more.
Do not refactor unrelated code.
Do not rename files that were not mentioned.
Do not add features that were not requested.
If you notice something else that needs fixing,
mention it AFTER completing the current task.

## RULE 3: ERRORS — NEVER FIX ALONE
If you encounter an error:
1. Stop immediately
2. Show me the exact error message
3. Explain in plain English what caused it
4. Propose ONE solution and wait for approval
NEVER silently work around an error.
NEVER modify files just to suppress errors.

## RULE 4: FILE SIZE LIMIT
No file should exceed 200 lines.
If a file approaches 200 lines, stop and tell me.
We will split it together before continuing.

## RULE 5: NEVER WITHOUT PERMISSION
- Never install a new npm package without asking
- Never delete any file without asking
- Never rename any file without asking
- Never push to GitHub without being asked
- Never modify environment variables instructions
Always ask first. Always wait for approval.

## RULE 6: ALWAYS CHECK YOUR WORK
After completing any task:
1. Re-read what was asked
2. Confirm every part was completed
3. If anything was skipped, say so clearly
Never report "done" if anything is incomplete.

## RULE 7: SECURITY — NON-NEGOTIABLE
- Never log actual values of API keys or secrets
- Never hardcode credentials in any file
- Never commit .env files to GitHub
- All API credentials must come from environment 
  variables only
- Never expose credentials in frontend code
- All API calls to external registries must go 
  through /api backend routes, never directly 
  from the browser

## RULE 8: KEEP ME INFORMED
After every completed task tell me:
- What you built (plain English, 1-2 sentences)
- What file(s) were created or changed
- How to see it working (if applicable)
- Anything I should know or watch out for

## RULE 9: NO DUMMY DATA EVER
- Never add hardcoded sample or mock trademark data
- Never use placeholder company names or serial numbers
- The Portfolio table must always start empty
- Only real API responses or user-uploaded CSVs 
  may populate the dashboard
- If you need to test, use real API calls only

## RULE 10: PUSH ONLY WHEN ASKED
Never push to GitHub unless explicitly instructed.
When asked to push, always use a clear descriptive 
commit message explaining what changed.
After pushing, confirm the Vercel deployment succeeded 
by checking the deployment URL.

## SUBSIDIARIES (src/subsidiaries.js)
1. Yanolja Cloud Pte. Ltd. — Singapore
2. Go Global Travel Ltd. — Israel
3. Yanolja Co., Ltd. — South Korea
4. Yanolja Cloud Solution PVT Ltd. — India
5. Nol Universe Co., Ltd. — South Korea
6. MST TRAVEL LTD. — Israel
7. RightRez, Inc. — United States
8. Innsoft, Inc. — United States
9. Yanolja F&G Co., Ltd. — South Korea
10. Yanolja Cloud Go Global Korea Co., Ltd. — South Korea
11. Yanolja Cloud Partners Co., Ltd. — South Korea
12. Yanolja Partners Co., Ltd. — South Korea

## DATA SOURCES

All registries are CSV-driven. Live API integrations were deprecated
because endpoints (KIPRIS Plus, WIPO Madrid Monitor) proved unreliable
for compliance use. Manual CSV upload gives consistent, auditable data.

### Manual CSV Upload (Universal System)
Any country can be uploaded using the standardized CSV
template. All uploads use the same column format:
Applicant | Mark Name | Application No. | Registration No. |
Kind of Mark | NCL Class | Country of Filing | Registry |
Filed Date | Publication Date | Registration Date |
Expiry Date | Current Status

Currently active registries (all CSV upload):
- KIPRIS (South Korea) — export from kipris.or.kr
- USPTO (United States) — export from tsdr.uspto.gov
- WIPO Madrid (International) — export from WIPO Madrid Monitor
- IP India — download from ipindia.gov.in
- ILPO Israel — download from trademarks.justice.gov.il

### Madrid filing convention (decided 2026-05-07)
WIPO Madrid filings are stored as FLAT rows — one row per
(IRN, designated country) pair. The same Application No. (IRN)
appears in multiple rows when the international registration
designates multiple countries. The dashboard counts each row
as one trademark right, which matches compliance reporting:
"5 rows for IRN 1490108" = "5 active rights across 5 countries".
No parent-child / expand-row UI — flat is sufficient.
- Any other country as needed — same template

### Removed / Deprecated
| Registry | Reason |
|---|---|
| EUIPO | Removed — no longer in scope |
| Marker API (USPTO) | Removed — service shut down |
| KIPRIS live API | Deprecated 2026-05-07 — dead backend code retained at api/kipris-search.js and api/kipris-us-search.js for reference |
| WIPO Madrid live API | Deprecated 2026-05-07 — dead backend code retained at api/wipo-search.js |

## DASHBOARD TABS
1. **Portfolio** — unified trademark table with all registry data
   - Columns: Applicant, Trademark, Registry, Country, App. No.,
     Reg. No., Type, Filed, Registered, Status
   - Loads empty on start — user clicks Refresh All to fetch
   - Results cached in localStorage with timestamp
   - Manual upload data merged with live API data

2. **By Entity** — one card per subsidiary showing filing counts
   by registry, registered/pending/expiring/opposed/expired breakdown,
   last fetch time

3. **Analytics** — charts from live data:
   - Status distribution donut chart
   - Filings over time line chart
   - NCL class breakdown horizontal bar chart

4. **API Setup** — single control panel for ALL data sources:
   - Registry status cards (all CSV upload)
   - Universal CSV upload manager (any country, same template)
   - Download CSV template button
   - Subsidiary entities list

## API ROUTES (in /api folder) — ALL DEAD CODE
None of these are wired up in src/registries.js any more (apiPath: null
for all registries). Files retained for reference / future revival only.
- /api/wipo-search — was WIPO Madrid Monitor scraping
- /api/kipris-search — was KIPRIS Plus right-holder search (Korea)
- /api/kipris-us-search — was KIPRIS Foreign Trademark Search (USPTO)
- /api/ipindia-search — was IP India placeholder
- /api/ilpo-search — was ILPO Israel placeholder

## KEY DESIGN DECISIONS
- Dark theme: deep navy (#0d0f14) background, electric blue/green accents
- No auto-fetch on load — manual refresh only to avoid timeouts
- Sequential fetching per entity (not all parallel) to avoid timeouts
- 15 second timeout per API call
- Results cached in localStorage for 24 hours
- WIPO: free public API confirmed working for IR number lookup
  but no holder name search endpoint available publicly
- KIPRIS: covers both Korean (KIPO) and US (USPTO) trademark data
  and potentially WIPO data — to be confirmed on API approval
- IP India and ILPO: no public API — universal CSV upload approach
- Section 8/15 affidavit tracking: deliberately excluded
- Dashboard purpose: compliance disclosure — display filing numbers 
  and registration status only
- No common law trademark tracking — registered marks only
- Singapore local filings excluded — covered by WIPO Madrid

## ENVIRONMENT VARIABLES (set in Vercel)
None required currently. All registries are CSV-driven.

## REMOVED ENVIRONMENT VARIABLES
- MARKER_API_USERNAME — removed (service shut down)
- MARKER_API_PASSWORD — removed (service shut down)
- KIPRIS_API_KEY — no longer used (KIPRIS moved to CSV upload 2026-05-07);
  can be removed from Vercel project settings

## IMPORTANT CONTEXT
- Dashboard is now CSV-driven for all registries (decided 2026-05-07).
  Live APIs proved unreliable for compliance use.
- IP India: CAPTCHA blocking — no programmatic access possible
- ILPO Israel: no public API exists
- KIPRIS: live API deprecated — endpoint coverage didn't match the
  public KIPRIS web search; counts were inconsistent
- WIPO Madrid: live API deprecated — unofficial endpoints required
  browser-specific compression (LZ-string) and could break anytime
- EUIPO: fully removed from scope (2026-04-29)
- Google Workspace hosting considered but kept on Vercel —
  Google SSO to be evaluated with security team
- Git user email must be: heewoong.park@yanolja.com
  (not .group — caused deployment issues previously)
- Always promote latest deployment to Production in Vercel
  if auto-promotion does not trigger

## NEXT STEPS PENDING
1. Google SSO decision from security team
2. Document the CSV export workflow for each registry (KIPRIS, USPTO,
   WIPO Madrid) so the user has a clear recurring playbook
