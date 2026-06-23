// Transformă un text (cu diacritice românești) într-un slug URL-safe.
const RO_MAP = {
  ă: 'a', â: 'a', î: 'i', ș: 's', ş: 's', ț: 't', ţ: 't',
  Ă: 'a', Â: 'a', Î: 'i', Ș: 's', Ş: 's', Ț: 't', Ţ: 't',
};

export function slugify(text) {
  return String(text || '')
    .trim()
    .replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (c) => RO_MAP[c] || c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // elimină accentele rămase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // tot ce nu e alfanumeric → liniuță
    .replace(/^-+|-+$/g, '') // fără liniuțe la capete
    .slice(0, 80);
}
