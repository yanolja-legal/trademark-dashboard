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
 *
 * Note: All registries are now CSV-driven. The live API integrations for
 * KIPRIS, USPTO, and WIPO Madrid were deprecated in favour of manual CSV
 * uploads because the API endpoints proved unreliable for compliance use.
 * Backend route files in /api are retained as dead code for reference but
 * are no longer wired up via apiPath.
 */
export const REGISTRIES = [
  {
    id:             'wipo',
    label:          'WIPO Madrid',
    value:          'WIPO Madrid',
    fetchStrategy:  'csv',
    apiPath:        null,
    queryParam:     null,
    requiresKey:    false,
    note:           'Manual CSV upload — export from WIPO Madrid Monitor and upload below',
    csvColumns:     ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Status'],
  },
  {
    id:             'uspto',
    label:          'USPTO',
    value:          'USPTO',
    fetchStrategy:  'csv',
    apiPath:        null,
    queryParam:     null,
    requiresKey:    false,
    note:           'Manual CSV upload — export from tsdr.uspto.gov and upload below',
    csvColumns:     ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Status'],
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
    csvColumns:    ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Status'],
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
    csvColumns:    ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Status'],
  },
  {
    id:             'kipris',
    label:          'KIPRIS',
    value:          'KIPRIS',
    fetchStrategy:  'csv',
    apiPath:        null,
    queryParam:     null,
    requiresKey:    false,
    note:           'Manual CSV upload — export from kipris.or.kr and upload below',
    csvColumns:     ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Status'],
  },
]
