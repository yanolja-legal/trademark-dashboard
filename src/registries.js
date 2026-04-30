/**
 * Registry configuration — single source of truth used by App.jsx (for fetching)
 * and ApiSetup.jsx (for the status panel).
 *
 * label         — display name shown in UI (status panel, chips)
 * value         — exact `registry` string returned by the API in result records
 * fetchStrategy — 'numbers' | 'holder' | 'csv' | 'none'
 *   'numbers' → fetch by known IR/serial numbers from knownMarks.js
 *   'holder'  → search by holder/company name via API
 *   'csv'     → manual CSV upload in Portfolio tab; no auto-fetch
 *   'none'    → not yet implemented; shows pending in status panel
 * apiPath       — null means never auto-fetched
 */
export const REGISTRIES = [
  {
    id:             'wipo',
    label:          'WIPO Madrid',
    value:          'WIPO Madrid',
    fetchStrategy:  'holder',
    apiPath:        '/api/wipo-search',
    queryParam:     'holder',
    searchKeyField: 'searchKey',
    requiresKey:    false,
    note:           'WIPO Madrid Monitor — holder name search via unofficial endpoints; may break without notice',
  },
  {
    id:             'uspto',
    label:          'USPTO (via KIPRIS)',
    value:          'USPTO',
    fetchStrategy:  'holder',
    apiPath:        '/api/kipris-us-search',
    queryParam:     'applicantName',
    searchKeyField: 'kiprisUsSearchKey',
    knownMarksKey:  'uspto',
    requiresKey:    true,
    note:           'USPTO data via KIPRIS Foreign Trademark Search — searches by applicant name',
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
    id:             'kipris',
    label:          'KIPRIS',
    value:          'KIPRIS',
    fetchStrategy:  'holder',
    apiPath:        '/api/kipris-search',
    queryParam:     'applicantName',
    searchKeyField: 'kiprisSearchKey',
    knownMarksKey:  'kipris',
    requiresKey:    true,
    note:           'Korean IP Registry (KIPO) — searches by applicant name',
  },
]
