/**
 * Registry configuration — single source of truth used by App.jsx (for fetching)
 * and ApiSetup.jsx (for the status panel).
 *
 * label       — display name shown in the UI (status panel, chips)
 * value       — the exact `registry` string returned by the API in result records;
 *               used for data matching in Portfolio/ByEntity. Equals label when
 *               the two are the same.
 * apiPath     — null means not yet implemented; never fetched, shown as pending.
 */
export const REGISTRIES = [
  {
    id:          'wipo',
    label:       'WIPO Madrid',
    value:       'WIPO Madrid',
    apiPath:     '/api/wipo-search',
    queryParam:  'holder',
    requiresKey: false,
    note:        'Public API — no credentials required',
  },
  {
    id:          'uspto',
    label:       'USPTO',
    value:       'USPTO',
    apiPath:     '/api/uspto-search',
    queryParam:  'owner',
    requiresKey: false,
    note:        'Public API — no credentials required',
  },
  {
    id:          'ipindia',
    label:       'IP India',
    value:       'IP India',
    apiPath:     '/api/ipindia-search',
    queryParam:  'holder',
    requiresKey: false,
    note:        'Public web scraper — no credentials required',
  },
  {
    id:          'ilpo',
    label:       'ILPO Israel',
    value:       'ILPO',           // API returns registry: 'ILPO'
    apiPath:     '/api/ilpo-search',
    queryParam:  'holder',
    requiresKey: false,
    note:        'data.gov.il CKAN open data — no credentials required',
  },
  {
    id:          'euipo',
    label:       'EUIPO',
    value:       'EUIPO',
    apiPath:     '/api/euipo-search',
    queryParam:  'holder',
    requiresKey: true,
    note:        'OAuth2 client credentials — set EUIPO_CLIENT_ID + EUIPO_CLIENT_SECRET',
  },
  {
    id:          'kipris',
    label:       'KIPRIS',
    value:       'KIPRIS',
    apiPath:     null,
    queryParam:  'holder',
    requiresKey: true,
    note:        'Korean IP Registry — API integration pending',
  },
]
