import { IDbClient } from "../../domain/database/IDbClient";
import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { User, UserRole } from "../../domain/entities/User";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

function toEntity(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * El repositorio se instancia por request con un `db` que ya viene
 * escopeado al usuario actual por `withRLSContext` (o al rol de sistema
 * para flujos sin usuario todavía, como login/signup).
 */
export class SupabaseUserRepository implements IUserRepository {
  constructor(private readonly db: IDbClient) {}

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT * FROM rw_users WHERE id = $1`, [id]);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT * FROM rw_users WHERE email = $1`, [email]);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async create(input: { name: string; email: string; passwordHash: string; role?: UserRole }): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO rw_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, COALESCE($4, 'user'))
       RETURNING *`,
      [input.name, input.email, input.passwordHash, input.role ?? null]
    );
    return toEntity(rows[0]!);
  }
}
