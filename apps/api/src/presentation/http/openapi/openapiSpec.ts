/**
 * Especificación OpenAPI 3.0 escrita a mano (no generada desde los schemas
 * de Zod) — para la cantidad de endpoints que tiene esta API, mantener un
 * solo archivo así es más simple que meter una librería de generación
 * automática. Se sirve como JSON en /api/openapi.json y como Swagger UI en
 * /api/docs (ver app.ts).
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Riwi Internal Messenger API",
    version: "1.0.0",
    description:
      "API de mensajería interna con RLS a nivel de datos y un copiloto de IA (RAG). Todas las rutas bajo /api salvo /health.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string" },
              correlationId: { type: "string", format: "uuid" },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["user", "admin"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Channel: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          createdBy: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          channelId: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          authorName: { type: "string" },
          content: { type: "string" },
          status: { type: "string", enum: ["pending", "sent", "failed", "deleted"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Falta o es inválido el access token",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "No tienes permiso sobre este recurso",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "El recurso no existe",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      ValidationError: {
        description: "El body/params/query no pasó la validación",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Crear una cuenta nueva (rol 'user' siempre)",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 100 },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8, maxLength: 72 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Cuenta creada",
            content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } },
          },
          "409": { description: "El email ya está registrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Login correcto", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotar el refresh token y obtener un access token nuevo",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: {
          "200": {
            description: "Par de tokens nuevo",
            content: { "application/json": { schema: { type: "object", properties: { accessToken: { type: "string" }, refreshToken: { type: "string" } } } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revocar el refresh token (no falla si ya está revocado)",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: { "204": { description: "Sesión cerrada" } },
      },
    },
    "/channels": {
      get: {
        tags: ["Channels"],
        summary: "Listar los canales del usuario autenticado",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { channels: { type: "array", items: { $ref: "#/components/schemas/Channel" } } } } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Channels"],
        summary: "Crear un canal (el creador queda como miembro automáticamente)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } } } },
        },
        responses: {
          "201": { description: "Canal creado", content: { "application/json": { schema: { type: "object", properties: { channel: { $ref: "#/components/schemas/Channel" } } } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/channels/{channelId}/messages": {
      get: {
        tags: ["Messages"],
        summary: "Historial de un canal, paginado por keyset (no OFFSET)",
        parameters: [
          { name: "channelId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "cursorCreatedAt", in: "query", schema: { type: "string", format: "date-time" }, description: "Debe ir junto con cursorId" },
          { name: "cursorId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    messages: { type: "array", items: { $ref: "#/components/schemas/Message" } },
                    nextCursor: { type: "object", nullable: true, properties: { createdAt: { type: "string" }, id: { type: "string" } } },
                  },
                },
              },
            },
          },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Messages"],
        summary: "Enviar un mensaje (debes ser miembro del canal)",
        parameters: [{ name: "channelId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string", minLength: 1, maxLength: 4000 } } } } },
        },
        responses: {
          "201": { description: "Mensaje enviado", content: { "application/json": { schema: { type: "object", properties: { message: { $ref: "#/components/schemas/Message" } } } } } },
          "403": { $ref: "#/components/responses/Forbidden" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/messages/read-receipts": {
      post: {
        tags: ["Messages"],
        summary: "Marcar mensajes como leídos",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["messageIds"], properties: { messageIds: { type: "array", items: { type: "string", format: "uuid" } } } } } },
        },
        responses: { "204": { description: "Marcados" } },
      },
    },
    "/messages/{messageId}": {
      patch: {
        tags: ["Messages"],
        summary: "Editar un mensaje propio (o cualquiera si eres admin)",
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string", minLength: 1, maxLength: 4000 } } } } },
        },
        responses: {
          "200": { description: "Mensaje editado", content: { "application/json": { schema: { type: "object", properties: { message: { $ref: "#/components/schemas/Message" } } } } } },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Messages"],
        summary: "Eliminar (soft delete) un mensaje propio, o cualquiera si eres admin",
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Eliminado" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/copilot/ask": {
      post: {
        tags: ["Copilot"],
        summary: "Preguntarle al copiloto de IA (RAG sobre los canales del usuario)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 1, maxLength: 1000 } } } } },
        },
        responses: {
          "200": {
            description: "Respuesta del copiloto",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answer: { type: "string" },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          messageId: { type: "string", format: "uuid" },
                          channelId: { type: "string", format: "uuid" },
                          authorName: { type: "string" },
                          excerpt: { type: "string" },
                          similarity: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
