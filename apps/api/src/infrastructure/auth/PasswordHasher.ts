import bcrypt from "bcryptjs";

/**
 * Wrapper delgado sobre bcrypt para que los casos de uso dependan de un
 * nombre de método ("hash"/"compare"), no de la librería bcrypt
 * directamente. Uso bcryptjs (JS puro) en vez de bcrypt nativo para
 * evitarme dolores de cabeza compilando código nativo en Docker, quedando
 * 100% compatible con los hashes `$2b$...` ya sembrados en el seed.
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
