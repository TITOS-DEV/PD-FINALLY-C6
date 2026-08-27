import bcrypt from "bcryptjs";

/**
 * Thin wrapper around bcrypt so use cases depend on a method name
 * ("hash"/"compare"), not on the bcrypt library directly. Using bcryptjs
 * (pure JS) instead of native bcrypt avoids native build headaches in
 * Docker while staying 100% hash-compatible with the seeded `$2b$...` values.
 */
export class PasswordHasher {
  private readonly saltRounds = 10;

  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  async compare(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }
}
