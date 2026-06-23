import config from '../config.js';

// 404 pentru rutele /api inexistente.
export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Endpoint inexistent', path: req.path });
}

// Handler central de erori — trebuie să aibă 4 argumente.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Erori multer (upload) → 400 cu mesaj prietenos.
  if (err.name === 'MulterError') {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Fișier prea mare (max 5MB).'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Prea multe fișiere (max 12).'
          : 'Eroare la încărcarea fișierului.';
    return res.status(400).json({ error: msg });
  }

  const status = err.status || 500;

  if (status >= 500) {
    console.error('[error]', err.stack || err.message);
  }

  const body = {
    error: err.message || 'Eroare internă',
  };
  if (err.details) body.details = err.details;
  if (status >= 500 && config.isProd) {
    body.error = 'A apărut o eroare. Încearcă din nou.';
  }

  res.status(status).json(body);
}
