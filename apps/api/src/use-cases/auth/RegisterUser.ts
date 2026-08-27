import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { PasswordHasher } from "../../infrastructure/auth/PasswordHasher";
import { ConflictError } from "../../domain/errors/AppError";
import { PublicUser, toPublicUser } from "../../domain/entities/User";

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Signup. Like AuthenticateUser, this runs with no `auth.uid()` yet, so
 * it's wired with the system DB context. New accounts always come out as
 * role "user" — nobody gets to self-promote to admin through this endpoint.
 */
export class RegisterUser {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async execute(input: RegisterUserInput): Promise<PublicUser> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: "user",
    });

    return toPublicUser(user);
  }
}
