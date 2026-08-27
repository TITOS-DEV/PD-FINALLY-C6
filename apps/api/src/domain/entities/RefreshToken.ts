/**
 * Una sesión de refresh token. Refleja `rw_refresh_tokens`.
 *
 * Nunca guardamos el refresh token en crudo, solo un hash (`tokenHash`) —
 * la misma idea que con las contraseñas: si la BD se filtra algún día, los
 * tokens ahí dentro no sirven para nada sin el valor original que tiene el cliente.
 */
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  /** Null mientras está activo. Se marca apenas se rota, reemplaza o se cierra sesión. */
  revokedAt: Date | null;
  createdAt: Date;
}
