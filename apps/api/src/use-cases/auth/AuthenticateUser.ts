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
 * Login. Corre antes de saber quién llama, así que se conecta (en
 * container.ts) con repositorios respaldados por el contexto de sistema de
 * la BD — todavía no hay ningún `auth.uid()` que setear, ese es justo el
 * punto de este caso de uso.
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

    // El mismo mensaje genérico sea que el email no exista o que la
    // contraseña esté mal — distinguirlos le permitiría a un atacante
    // enumerar emails válidos.
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const passwordMatches = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedError("Invalid email or password");

    const accessToken = this.jwtService.signAccessToken({ sub: user.id, role: user.role });

    // "Rotación" también arranca acá: un login nuevo revoca cualquier
    // refresh token que existiera antes, así que el índice único parcial
    // (idx_rw_active_refresh_token_unique) nunca ve dos filas activas para
    // el mismo usuario — un segundo dispositivo logueándose saca en
    // silencio al refresh token del primero, a propósito, no es un bug.
    // `replaceActiveToken` es quien resuelve, del lado de infraestructura,
    // la carrera de dos logins casi simultáneos para el mismo usuario (ver
    // SupabaseRefreshTokenRepository) — el caso de uso no necesita saber nada de eso.
    const rawRefreshToken = this.jwtService.generateRefreshToken();
    await this.refreshTokenRepository.replaceActiveToken({
      userId: user.id,
      tokenHash: this.jwtService.hashRefreshToken(rawRefreshToken),
      expiresAt: this.jwtService.getRefreshTokenExpiry(),
    });

    return { user: toPublicUser(user), accessToken, refreshToken: rawRefreshToken };
  }
}
