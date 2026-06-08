/**
 * Vietnamese time parser v3 — context-aware + heuristic.
 * Returns: { iso: string } | { ambiguous: true, hour: number } | null
 */
function parseVietnameseTime(text, now = new Date()) {
  const lower = text.toLowerCase();
  const vnNow = Math.floor(
    ((now.getTime() + 7 * 3600000) % 86400000) / 3600000,
  );

  let hour = null,
    minute = 0,
    dayOffset = 0,
    isPM = null,
    explicit = false;

  const hm = lower.match(/(\d{1,2})\s*(h|giờ|g|:(\d{2}))/);
  if (hm) {
    hour = parseInt(hm[1]);
    if (hm[3]) minute = parseInt(hm[3]);
  }
  if (hour === null) return null;

  if (/(sáng|sag|buổi sáng)/.test(lower)) {
    isPM = false;
    explicit = true;
  }
  if (/(chiều|chiêu|trưa|buổi chiều)/.test(lower)) {
    isPM = true;
    explicit = true;
  }
  if (/(tối|đêm|tôi|buổi tối)/.test(lower)) {
    isPM = true;
    explicit = true;
  }

  // Heuristic: 4-6h default PM unless explicit "sáng"
  if (!explicit && hour >= 4 && hour <= 6) isPM = true;

  if (/(mai|ngày mai)/.test(lower)) dayOffset = 1;
  if (/(mốt|ngày kia)/.test(lower)) dayOffset = 2;

  const dayMap = {
    "thứ 2": 1,
    "thứ hai": 1,
    "thứ 3": 2,
    "thứ ba": 2,
    "thứ 4": 3,
    "thứ tư": 3,
    "thứ 5": 4,
    "thứ năm": 4,
    "thứ 6": 5,
    "thứ sáu": 5,
    "thứ 7": 6,
    "thứ bảy": 6,
    "chủ nhật": 0,
    cn: 0,
  };
  for (const [k, td] of Object.entries(dayMap)) {
    if (lower.includes(k)) {
      let diff = td - new Date(now).getDay();
      if (diff <= 0) diff += 7;
      if (/(tuần sau|tuần tới)/.test(lower)) diff += 7;
      dayOffset = diff;
      break;
    }
  }

  // ─── Ambiguous check ───
  if (!explicit && dayOffset === 0 && hour >= 1 && hour <= 12) {
    const am = hour,
      pm = hour + 12;
    if (am > vnNow) {
      isPM = false;
    } // AM is future → use AM
    else if (pm <= vnNow) {
      return { ambiguous: true, hour };
    } // Both past
    else {
      return { ambiguous: true, hour };
    } // AM past, PM future → ask
  }

  if (isPM && hour < 12) hour += 12;

  // Build UTC ISO
  const d = new Date(now);
  d.setUTCHours(hour - 7, minute, 0, 0);
  if (dayOffset) d.setUTCDate(d.getUTCDate() + dayOffset);
  if (d.getTime() <= now.getTime() && dayOffset === 0)
    d.setUTCDate(d.getUTCDate() + 1);

  return { iso: d.toISOString() };
}

module.exports = { parseVietnameseTime };
