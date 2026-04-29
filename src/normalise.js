/**
 * Central data normalisation — single source of truth for standardising
 * trademark records returned from any registry (live API or manual CSV upload).
 *
 * Used by every /api route and by the CSV upload parser in ApiSetup.jsx.
 * If a registry adds a new raw value, add it to the relevant map below.
 */

// ── KIND OF MARK ────────────────────────────────────────────────────────────
// Raw value (lowercased, trimmed) → standard label.
const KIND_MAP = {
  // Word
  '문자': 'Word', 'word': 'Word', '문자상표': 'Word', 'wordmark': 'Word',
  'verbal': 'Word', 'word mark': 'Word', 'word only': 'Word', '문자만': 'Word',

  // Figurative
  '도형': 'Figurative', 'figure': 'Figurative', 'figurative': 'Figurative',
  'device': 'Figurative', 'logo': 'Figurative', '도형상표': 'Figurative',
  'design': 'Figurative', 'device mark': 'Figurative',

  // Combined
  '복합': 'Combined', 'combined': 'Combined', 'composite': 'Combined',
  'mixed': 'Combined', 'combination': 'Combined', '복합상표': 'Combined',
  'word and device': 'Combined', 'word & device': 'Combined', 'complex': 'Combined',

  // 3D
  '입체': '3D', '3d': '3D', 'three_dimensional': '3D', 'three-dimensional': '3D',
  'three dimensional': '3D', '3-dimensional': '3D', '입체상표': '3D',
  'shape mark': '3D', 'shape': '3D',

  // Sound
  '소리': 'Sound', 'sound': 'Sound', 'audio': 'Sound', '소리상표': 'Sound',
  'acoustic': 'Sound',

  // Colour
  '색채': 'Colour', 'colour': 'Colour', 'color': 'Colour', '색채상표': 'Colour',
  'colour mark': 'Colour', 'color mark': 'Colour',

  // Other
  '기타': 'Other', 'other': 'Other', 'others': 'Other',
  'undefined': 'Other', 'unknown': 'Other', 'null': 'Other',
}

// ── STATUS ──────────────────────────────────────────────────────────────────
// Raw value (lowercased, trimmed) → standard label.
const STATUS_MAP = {
  // Registered
  'registered': 'Registered', '등록': 'Registered', 'active': 'Registered',
  'live': 'Registered', 'granted': 'Registered',
  'registered and renewed': 'Registered', '등록완료': 'Registered',
  'valid': 'Registered', 'registration': 'Registered', '설정등록': 'Registered',

  // Pending
  'pending': 'Pending', '출원': 'Pending', 'under examination': 'Pending',
  'filed': 'Pending', 'application filed': 'Pending', '출원중': 'Pending',
  'awaiting': 'Pending', 'under review': 'Pending', 'under processing': 'Pending',
  'received': 'Pending', 'under_examination': 'Pending', '심사중': 'Pending',
  '공개': 'Pending',

  // Opposed
  'opposed': 'Opposed', '이의신청': 'Opposed', 'opposition': 'Opposed',
  '이의': 'Opposed', 'opposition filed': 'Opposed',
  'under opposition': 'Opposed', '이의신청중': 'Opposed',

  // Lapsed
  'lapsed': 'Lapsed', '소멸': 'Lapsed', 'abandoned': 'Lapsed', 'dead': 'Lapsed',
  'cancelled': 'Lapsed', 'withdrawn': 'Lapsed', '취하': 'Lapsed',
  '포기': 'Lapsed', 'lapsed due to non renewal': 'Lapsed', '권리소멸': 'Lapsed',

  // Expired
  'expired': 'Expired', '만료': 'Expired', '존속기간만료': 'Expired',
  'registration expired': 'Expired', 'term expired': 'Expired', 'expiry': 'Expired',

  // Refused
  'refused': 'Refused', '거절': 'Refused', 'rejected': 'Refused',
  '거절결정': 'Refused', 'refusal': 'Refused',
}

/** Normalise a raw "kind of mark" value. Falls back to "Other" if unknown. */
export function normaliseKind(rawValue) {
  if (rawValue == null) return 'Other'
  const key = String(rawValue).trim().toLowerCase()
  if (key === '') return 'Other'
  return KIND_MAP[key] || 'Other'
}

/** Normalise a raw status value. Falls back to original (untouched) if unknown. */
export function normaliseStatus(rawValue) {
  if (rawValue == null || rawValue === '') return rawValue
  const key = String(rawValue).trim().toLowerCase()
  return STATUS_MAP[key] || rawValue
}

/**
 * Normalise an entire trademark record. Returns a new object — does not mutate.
 * Only `kindOfMark` and `status` are transformed; all other fields pass through.
 */
export function normaliseTrademarkData(trademark) {
  if (!trademark || typeof trademark !== 'object') return trademark
  return {
    ...trademark,
    kindOfMark: normaliseKind(trademark.kindOfMark),
    status:     normaliseStatus(trademark.status),
  }
}
