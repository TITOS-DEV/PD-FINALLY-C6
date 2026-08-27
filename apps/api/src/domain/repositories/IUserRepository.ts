import { User } from "../entities/User";

/**
 * Puerto para leer/escribir usuarios. Los casos de uso solo conocen esta
 * interfaz; no tienen idea de si está respaldada por SQL crudo, el cliente
 * de Supabase, o cualquier otra cosa — ese es todo el punto de la inversión
 * de dependencias de Clean Architecture.
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
