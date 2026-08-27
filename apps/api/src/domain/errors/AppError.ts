/**
 * Clase base para cada error que la aplicación lanza a propósito.
 *
 * La idea es simple: los casos de uso y repositorios nunca tocan Express ni
 * escriben `res.status(...)` — simplemente hacen `throw` de uno de estos.
 * Un único middleware en el borde (ver errorHandler.ts) sabe cómo convertir
 * cualquier AppError en la respuesta HTTP correcta. Cualquier cosa que NO
 * sea un AppError se trata como un bug y se responde con un 500 genérico,
 * sin filtrarle nunca detalles internos al cliente.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Código legible por máquina para que el frontend pueda ramificar (ej. "INVALID_CREDENTIALS"). */
    public readonly code: string,
    /** Contexto extra, solo se loguea del lado del servidor, nunca se le manda al cliente. */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

// Nota: los mensajes por defecto se dejan en inglés a propósito — son texto
// que puede terminar mostrándose en un JSON de respuesta al cliente (a la
// API/frontend le toca traducirlo si hace falta, ver el i18n del frontend).
// Los COMENTARIOS del código sí están en español; el texto de cara al
// cliente sigue la decisión de "código en inglés" del proyecto.
export class ValidationError extends AppError {
  constructor(message = "The request payload is invalid", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required or the credentials are invalid") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this resource") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource doesn't exist") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state") {
    super(message, 409, "CONFLICT");
  }
}
