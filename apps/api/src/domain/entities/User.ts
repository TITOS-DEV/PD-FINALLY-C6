/**
 * Un usuario de la plataforma. Refleja la tabla `rw_users`.
 *
 * Esto es a propósito una forma de dato plana: la capa de dominio no tiene
 * idea de que existen Postgres, Supabase o cualquier framework HTTP.
 * Todo lo que toca infraestructura (hashear, SQL, JSON) pasa fuera de este
 * archivo.
 */
export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Hash de bcrypt, nunca la contraseña en texto plano. Lo dejo acá porque
   *  el repositorio necesita leerlo/escribirlo; los casos de uso nunca deberían exponerlo. */
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lo que de verdad queremos devolverle a un cliente después de autenticar:
 * todo menos el hash de la contraseña. Tenerlo como un tipo aparte evita
 * que nos "olvidemos" de quitar el hash antes de serializar una respuesta.
 */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
