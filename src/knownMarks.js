/**
 * Known trademark numbers per subsidiary.
 *
 * To add marks: fill in the arrays below and ask Claude Code to update this file.
 *
 * wipo   — WIPO Madrid IR numbers (integers), e.g. [1234567, 1234568]
 *           Fetch via: https://www3.wipo.int/madrid/monitor/en/showData.jsp?ID={IRN}
 *
 * uspto  — USPTO serial numbers (7–8 digit strings), e.g. ["76044902"]
 *           Fetch via: https://tsdrapi.uspto.gov/ts/cd/casestatus/sn{SERIAL}/info.xml
 *           Requires USPTO_API_KEY env var (free at developer.uspto.gov)
 *
 * euipo  — EUIPO application numbers, e.g. ["018756432"]
 *           Fetched automatically via OAuth2 holder-name search if EUIPO_CLIENT_ID is set
 *
 * ipindia — IP India application numbers
 *           Loaded via manual CSV upload in the Portfolio tab
 *
 * ilpo   — ILPO (Israel) trademark numbers
 *           Loaded via manual CSV upload in the Portfolio tab
 *
 * kipris — KIPRIS (Korea) application numbers
 *           Pending API integration
 */

export const KNOWN_MARKS = {
  "Yanolja Co., Ltd.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "Yanolja Cloud Pte. Ltd.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "Go Global Travel Ltd.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "Yanolja Cloud Solution PVT Ltd.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "Nol Universe Co., Ltd.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "MST TRAVEL LTD.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "RightRez, Inc.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
  "Innsoft, Inc.": {
    wipo:    [],
    uspto:   [],
    euipo:   [],
    ipindia: [],
    ilpo:    [],
    kipris:  [],
  },
}
