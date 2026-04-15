/**
 * Registry configuration — single source of truth used by App.jsx (for fetching)
 * and ApiSetup.jsx (for the status panel).
 *
 * label         — display name shown in UI (status panel, chips)
 * value         — exact `registry` string returned by the API in result records
 * fetchStrategy — 'numbers' | 'holder' | 'csv' | 'none'
 *   'numbers' → fetch by known IR/serial numbers from knownMarks.js
 *   'holder'  → search by holder/company name (EUIPO OAuth2)
 *   'csv'     → manual CSV upload in Portfolio tab; no auto-fetch
 *   'none'    → not yet implemented; shows pending in status panel
 * apiPath       — null means never auto-fetched
 */
export const REGISTRIES = [
  {
    id:            'wipo',
    label:         'WIPO Madrid',
    value:         'WIPO Madrid',
    fetchStrategy: 'numbers',
    apiPath:       '/api/wipo-search',
    queryParam:    'irNumbers',
    knownMarksKey: 'wipo',
    requiresKey:   false,
    note:          'Public API — fetch by IR number; no credentials required',
  },
  {
    id:            'uspto',
    label:         'USPTO',
    value:         'USPTO',
    fetchStrategy: 'none',
    apiPath:       null,
    queryParam:    null,
    knownMarksKey: 'uspto',
    requiresKey:   false,
    note:          'API integration pending — Marker API (previous provider) has shut down. Alternative under evaluation.',
  },
  {
    id:            'ipindia',
    label:         'IP India',
    value:         'IP India',
    fetchStrategy: 'csv',
    apiPath:       null,
    queryParam:    null,
    knownMarksKey: 'ipindia',
    requiresKey:   false,
    note:          'Manual CSV upload — download from ipindia.gov.in and upload below',
    csvColumns:    ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Expiry Date', 'Status'],
  },
  {
    id:            'ilpo',
    label:         'ILPO Israel',
    value:         'ILPO',
    fetchStrategy: 'csv',
    apiPath:       null,
    queryParam:    null,
    knownMarksKey: 'ilpo',
    requiresKey:   false,
    note:          'Manual CSV upload — download from trademarks.justice.gov.il and upload below',
    csvColumns:    ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Expiry Date', 'Status'],
  },
  {
    id:            'euipo',
    label:         'EUIPO',
    value:         'EUIPO',
    fetchStrategy: 'holder',
    apiPath:       '/api/euipo-search',
    queryParam:    'holder',
    knownMarksKey: 'euipo',
    requiresKey:   true,
    note:          'OAuth2 client credentials — set EUIPO_CLIENT_ID + EUIPO_CLIENT_SECRET',
  },
  {
    id:            'kipris',
    label:         'KIPRIS',
    value:         'KIPRIS',
    fetchStrategy: 'none',
    apiPath:       null,
    queryParam:    null,
    knownMarksKey: 'kipris',
    requiresKey:   true,
    note:          'Korean IP Registry — API integration pending',
  },
]
