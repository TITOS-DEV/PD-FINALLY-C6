import { AccessTokenPayload } from "../../../infrastructure/auth/JwtService";

// Augments Express's Request so `req.user` and `req.correlationId` are
// typed everywhere without casting.
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      correlationId: string;
    }
  }
}

export {};
