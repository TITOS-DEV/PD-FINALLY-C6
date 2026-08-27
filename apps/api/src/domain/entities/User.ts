/**
 * A user of the platform. Mirrors the `rw_users` table.
 *
 * This is a plain data shape on purpose: the domain layer has no idea
 * Postgres, Supabase or any HTTP framework exist. Anything that touches
 * infrastructure (hashing, SQL, JSON) happens outside of this file.
 */
export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Bcrypt hash, never the plain password. Kept here only because the
   *  repository needs to read/write it; use cases should never expose it. */
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What we actually want to hand back to a client after auth: everything
 * except the password hash. Keeping this as a separate type stops us from
 * "forgetting" to strip the hash before serializing a response.
 */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
