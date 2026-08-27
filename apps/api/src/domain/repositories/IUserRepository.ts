import { User } from "../entities/User";

/**
 * Port for reading/writing users. The use cases only know this interface;
 * they have no idea whether it's backed by raw SQL, Supabase's client, or
 * anything else — that's the whole point of Clean Architecture's
 * dependency inversion.
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role?: "user" | "admin";
  }): Promise<User>;
}
