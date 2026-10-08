const MODES = ['Remote', 'Hybrid', 'On-site'];

const TEXT_FIELDS = {
  title: { min: 3, max: 100 },
  domain: { min: 2, max: 60 },
  location: { min: 2, max: 60 },
};

// Checks a request body. Returns { errors, clean }.
// partial = true (PATCH): only validate the fields that were sent.
function validateInternship(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], clean };
  }

  const has = (f) => body[f] !== undefined;
  const check = (f) => !partial || has(f);

  for (const [field, { min, max }] of Object.entries(TEXT_FIELDS)) {
    if (!check(field)) continue;
    const v = body[field];
    if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) {
      errors.push({ field, message: `${field} must be text between ${min} and ${max} characters` });
    } else clean[field] = v.trim();
  }

  if (check('mode')) {
    if (!MODES.includes(body.mode)) {
      errors.push({ field: 'mode', message: `mode must be one of: ${MODES.join(', ')}` });
    } else clean.mode = body.mode;
  }

  if (check('skills')) {
    const s = body.skills;
    const ok = Array.isArray(s) && s.length >= 1 && s.length <= 10 &&
      s.every((x) => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 40);
    if (!ok) {
      errors.push({ field: 'skills', message: 'skills must be a list of 1 to 10 non-empty texts (max 40 characters each)' });
    } else clean.skills = s.map((x) => x.trim());
  }

  if (check('openings')) {
    const o = body.openings;
    if (!Number.isInteger(o) || o < 0 || o > 1000) {
      errors.push({ field: 'openings', message: 'openings must be a whole number from 0 to 1000' });
    } else clean.openings = o;
  }

  if (partial && errors.length === 0 && Object.keys(clean).length === 0) {
    errors.push({ field: 'body', message: 'Send at least one field to update' });
  }

  return { errors, clean };
}

module.exports = { validateInternship, MODES };