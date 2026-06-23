// Utilitare HTTP mici.

// Învelește handlere async ca să prindă reject-urile și să le trimită la error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Eroare cu status HTTP atașat — aruncată din rute, prinsă de errorHandler.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Resursă inexistentă') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
