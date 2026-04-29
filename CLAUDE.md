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
1. Yanolja Cloud Pte. Ltd. — Singapore — searchKey: "Yanolja Cloud"
2. Go Global Travel Ltd. — Israel — searchKey: "Go Global Travel"
3. Yanolja Co., Ltd. — South Korea — searchKey: "Yanolja"
4. Yanolja Cloud Solution PVT Ltd. — India — searchKey: "Yanolja Cloud Solution"
5. Nol Universe Co., Ltd. — South Korea — searchKey: "Nol Universe"
6. MST TRAVEL LTD. — Israel — searchKey: "MST TRAVEL"
7. RightRez, Inc. — United States — searchKey: "RightRez"
8. Innsoft, Inc. — United States — searchKey: "Innsoft"

## DATA SOURCES

### Live APIs
| Registry | Coverage | Status | Env Var |
|---|---|---|---|
| WIPO Madrid | International Madrid System | Partial — IR number fetch works, holder name search pending solution | None needed |
| KIPRIS | South Korea + United States | Pending API key approval | KIPRIS_API_KEY |

### Manual CSV Upload (Universal System)
Any country can be uploaded using the standardized CSV 
template. All uploads use the same column format:
Applicant | Mark Name | Application No. | Registration No. | 
Kind of Mark | NCL Class | Country of Filing | Registry | 
Filed Date | Publication Date | Registration Date | 
Expiry Date | Current Status

Currently active manual upload countries:
- India (IP India) — CAPTCHA blocks automated access
- Israel (ILPO) — no public API available
- Any other country as needed — same template

### Removed / Pending Decision
| Registry | Reason |
|---|---|
| EUIPO | Removed — no longer in scope |
| Marker API (USPTO) | Removed — service shut down |

## DASHBOARD TABS
1. **Portfolio** — unified trademark table with all registry data
   - Columns: Applicant, Mark Name, Registry, Country of Filing,
     Serial No., Reg. No., Kind, NCL, Filed, Published, 
     Registered, Expires, Status, Flags
   - Loads empty on start — user clicks Refresh All to fetch
   - Results cached in localStorage with timestamp
   - Manual upload data merged with live API data

2. **By Entity** — one card per subsidiary showing filing counts
   by registry, registered/pending/lapsed breakdown, last fetch time

3. **Alerts** — auto-populated from live data:
   - Marks expiring within 90 days
   - Marks with Objected/Opposed status

4. **Analytics** — charts from live data:
   - Status distribution donut chart
   - Filings over time line chart
   - NCL class breakdown horizontal bar chart

5. **API Setup** — single control panel for ALL data sources:
   - Live API registry status cards with Test Connection buttons
   - Universal CSV upload manager (any country, same template)
   - Download CSV template button
   - Subsidiary entities list

## API ROUTES (in /api folder)
- /api/wipo-search — WIPO Madrid Monitor public API (IR number fetch)
- /api/kipris-search — KIPRIS Open API Korea (pending key)
- /api/kipris-us-search — KIPRIS Foreign Trademark Search for USPTO (pending key)
- /api/ipindia-search — IP India search placeholder (CSV upload used in practice)
- /api/ilpo-search — ILPO Israel search placeholder (CSV upload used in practice)

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
| Variable | Value | Status |
|---|---|---|
| KIPRIS_API_KEY | Add when approved | Pending |

## REMOVED ENVIRONMENT VARIABLES
- MARKER_API_USERNAME — removed (service shut down)
- MARKER_API_PASSWORD — removed (service shut down)

## IMPORTANT CONTEXT
- Expert advice: WIPO alone is insufficient for compliance —
  local registries needed for India, US, Israel, Korea
- KIPRIS may also provide WIPO data — confirm on API approval
- IP India: CAPTCHA blocking — no programmatic access possible
- ILPO Israel: no public API exists
- EUIPO: fully removed from scope (2026-04-29)
- Google Workspace hosting considered but kept on Vercel —
  Google SSO to be evaluated with security team
- Git user email must be: heewoong.park@yanolja.com
  (not .group — caused deployment issues previously)
- Always promote latest deployment to Production in Vercel
  if auto-promotion does not trigger

## NEXT STEPS PENDING
1. KIPRIS API key approval — will cover Korea + US + possibly WIPO
2. Google SSO decision from security team
3. WIPO holder name search solution — explore TMview API 
   or WIPO eMadrid rights holder access
