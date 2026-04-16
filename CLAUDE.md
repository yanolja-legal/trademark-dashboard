# Trademark Portfolio Compliance Dashboard

## Project Overview
Internal trademark monitoring dashboard for Yanolja and its 
8 subsidiaries. Built with React, deployed on Vercel, 
connected to GitHub.

**Live URL:** https://trademark-dashboard.vercel.app/
**GitHub:** trademark-dashboard repository
**Stack:** React, Vercel serverless functions (Node.js)

## Subsidiaries (src/subsidiaries.js)
1. Yanolja Cloud Pte. Ltd. — Singapore — searchKey: "Yanolja Cloud"
2. Go Global Travel Ltd. — Israel — searchKey: "Go Global Travel"
3. Yanolja Co., Ltd. — South Korea — searchKey: "Yanolja"
4. Yanolja Cloud Solution PVT Ltd. — India — searchKey: "Yanolja Cloud Solution"
5. Nol Universe Co., Ltd. — South Korea — searchKey: "Nol Universe"
6. MST TRAVEL LTD. — Israel — searchKey: "MST TRAVEL"
7. RightRez, Inc. — United States — searchKey: "RightRez"
8. Innsoft, Inc. — United States — searchKey: "Innsoft"

## Data Sources

### Live APIs
| Registry | Coverage | Status | Env Var |
|---|---|---|---|
| WIPO Madrid | International Madrid System | Connected — free public API | None needed |
| KIPRIS | South Korea + United States | Pending API key | KIPRIS_API_KEY |

### Manual CSV Upload
| Registry | Coverage | Status |
|---|---|---|
| IP India | India | Manual upload in API Setup tab |
| ILPO Israel | Israel | Manual upload in API Setup tab |

### Removed / Pending Decision
| Registry | Reason |
|---|---|
| EUIPO | Removed — alternative solution being evaluated |
| Marker API (USPTO) | Removed — service shut down |

## Dashboard Tabs
1. **Portfolio** — unified trademark table with all registry data
   - Columns: Applicant, Mark Name, Registry, Country of Filing,
     Serial No., Reg. No., Kind, NCL, Filed, Published, 
     Registered, Expires, Status, Flags
   - Loads empty on start — user clicks Refresh All to fetch
   - Results cached in localStorage with timestamp

2. **By Entity** — one card per subsidiary showing filing counts
   by registry, registered/pending/lapsed breakdown, last fetch time

3. **Alerts** — auto-populated from live data:
   - Marks expiring within 90 days
   - Marks with Objected/Opposed status

4. **Analytics** — charts from live data:
   - Status distribution donut chart
   - Filings over time line chart
   - NCL class breakdown horizontal bar chart

5. **API Setup** — single control panel for all data sources:
   - Live API registry status cards with Test Connection buttons
   - Manual CSV upload for IP India and ILPO Israel
   - Download CSV template buttons

## API Routes (in /api folder)
- /api/wipo-search — WIPO Madrid Monitor public API
- /api/kipris-search — KIPRIS Open API (pending key)
- /api/euipo-callback — OAuth callback placeholder (kept for future)

## Key Design Decisions
- Dark theme: deep navy (#0d0f14) background, electric blue/green accents
- No auto-fetch on load — manual refresh only to avoid timeouts
- Sequential fetching per entity (not all parallel) to avoid timeouts
- 15 second timeout per API call
- Results cached in localStorage for 24 hours
- WIPO: free public API at wipo.int/madrid/monitor/api/v1/tmxml
- KIPRIS: covers both Korean (KIPO) and US (USPTO) trademark data
- IP India and ILPO: no public API — manual CSV upload approach
- Section 8/15 affidavit tracking: deliberately excluded
- Dashboard purpose: compliance disclosure — display filing numbers 
  and registration status only

## Environment Variables (set in Vercel)
- KIPRIS_API_KEY — add when KIPRIS approval received

## Removed Environment Variables
- EUIPO_CLIENT_ID — removed
- EUIPO_CLIENT_SECRET — removed  
- EUIPO_ENV — removed
- MARKER_API_USERNAME — removed (service shut down)
- MARKER_API_PASSWORD — removed (service shut down)

## Important Context
- Expert advice received: WIPO alone is not sufficient for 
  definitive compliance — local registries needed for India, 
  US, Israel, Korea
- KIPRIS provides both Korean AND US trademark data via their API
- IP India has CAPTCHA blocking — no programmatic access possible
- ILPO Israel has no public API
- EUIPO requires registered app + production subscription approval
- Dashboard is for internal compliance disclosure purposes only
- No common law trademark tracking — registered marks only

## Next Steps Pending
1. KIPRIS API key approval — will cover Korea + US data
2. EUIPO alternative solution — to be determined
3. Add KIPRIS_API_KEY to Vercel once received
