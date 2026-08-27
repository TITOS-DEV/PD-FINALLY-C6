import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { PasswordHasher } from "../../infrastructure/auth/PasswordHasher";
import { JwtService } from "../../infrastructure/auth/JwtService";
import { UnauthorizedError } from "../../domain/errors/AppError";
import { PublicUser, toPublicUser } from "../../domain/entities/User";

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export interface AuthenticateUserOutput {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Login. Runs before we know who the caller is, so it's wired (in
 * container.ts) with repositories backed by the system DB context — there's
 * no `auth.uid()` to set yet, that's the whole point of this use case.
 */
export class AuthenticateUser {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwtService: JwtService
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const user = await this.userRepository.findByEmail(input.email);

    // Same generic message whether the email doesn't exist or the password
    // is wrong — telling them apart would let an attacker enumerate emails.
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const passwordMatches = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedError("Invalid email or password");

    const accessToken = this.jwtService.signAccessToken({ sub: user.id, role: user.role });

    // "Rotation" starts here too: a fresh login also revokes whatever
    // refresh token existed before, so the partial unique index
    // (idx_rw_active_refresh_token_unique) never sees two active rows for
    // the same user and a second device logging in silently kicks out the
    // first one's refresh token — deliberate, not a bug.
    const previousToken = await this.refreshTokenRepository.findActiveByUserId(user.id);
    if (previousToken) await this.refreshTokenRepository.revoke(previousToken.id);

    const rawRefreshToken = this.jwtService.generateRefreshToken();
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.jwtService.hashRefreshToken(rawRefreshToken),
      expiresAt: this.jwtService.getRefreshTokenExpiry(),
    });

    return { user: toPublicUser(user), accessToken, refreshToken: rawRefreshToken };
  }
}
