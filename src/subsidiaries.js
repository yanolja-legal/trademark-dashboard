// kiprisSearchKeys: optional Korean name(s) used to match this subsidiary against
// the Korean text in KIPRIS CSV uploads (specifically the 최종권리자 column).
// Stored as an array so an entity can have multiple known Korean spellings.
export const SUBSIDIARIES = [
  { id: 1,  name: "Yanolja Cloud Pte. Ltd.",                  shortName: "Yanolja Cloud",            country: "Singapore",     active: true, kiprisSearchKeys: ["야놀자클라우드"] },
  { id: 2,  name: "Go Global Travel Ltd.",                    shortName: "Go Global Travel",         country: "Israel",        active: true },
  { id: 3,  name: "Yanolja Co., Ltd.",                        shortName: "Yanolja",                  country: "South Korea",   active: true, kiprisSearchKeys: ["야놀자"] },
  { id: 4,  name: "Yanolja Cloud Solution PVT Ltd.",          shortName: "YCS India",                country: "India",         active: true },
  { id: 5,  name: "Nol Universe Co., Ltd.",                   shortName: "Nol Universe",             country: "South Korea",   active: true, kiprisSearchKeys: ["놀유니버스"] },
  { id: 6,  name: "MST TRAVEL LTD.",                          shortName: "MST Travel",               country: "Israel",        active: true },
  { id: 7,  name: "RightRez, Inc.",                           shortName: "RightRez",                 country: "United States", active: true },
  { id: 8,  name: "Innsoft, Inc.",                            shortName: "Innsoft",                  country: "United States", active: true },
  { id: 9,  name: "Yanolja F&G Co., Ltd.",                    shortName: "Yanolja F&G",              country: "South Korea",   active: true, kiprisSearchKeys: ["야놀자에프앤지", "야놀자애프앤지"] },
  { id: 10, name: "Yanolja Cloud Go Global Korea Co., Ltd.",  shortName: "Yanolja Cloud Go Global",  country: "South Korea",   active: true, kiprisSearchKeys: ["야놀자클라우드고글로벌코리아"] },
  { id: 11, name: "Yanolja Cloud Partners Co., Ltd.",         shortName: "Yanolja Cloud Partners",   country: "South Korea",   active: true, kiprisSearchKeys: ["야놀자클라우드파트너스"] },
  { id: 12, name: "Yanolja Partners Co., Ltd.",               shortName: "Yanolja Partners",         country: "South Korea",   active: true, kiprisSearchKeys: ["야놀자파트너스"] },
];
