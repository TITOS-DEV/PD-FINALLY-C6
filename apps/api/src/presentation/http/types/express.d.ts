import { AccessTokenPayload } from "../../../infrastructure/auth/JwtService";

// Extiende el Request de Express para que `req.user` y `req.correlationId`
// queden tipados en todas partes sin necesitar castear.
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      correlationId: string;
    }
  }
}

export {};
