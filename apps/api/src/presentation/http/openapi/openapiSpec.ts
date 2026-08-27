/**
 * Hand-written OpenAPI 3.0 spec (not generated from the Zod schemas) — for
 * the number of endpoints this API has, keeping a single file like this is
 * simpler than pulling in a generation library. Served as JSON at
 * /api/openapi.json and as Swagger UI at /api/docs (see app.ts).
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Riwi Internal Messenger API",
    version: "1.0.0",
    description:
      "Internal messaging API with row-level data security and an AI copilot (RAG). All routes are under /api except /health.",
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
        description: "Missing or invalid access token",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "You don't have permission over this resource",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "The resource doesn't exist",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      ValidationError: {
        description: "The body/params/query failed validation",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create a new account (always role 'user')",
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
            description: "Account created",
            content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } },
          },
          "409": { description: "Email already registered", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in",
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
          "200": { description: "Login successful", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate the refresh token and get a new access token",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: {
          "200": {
            description: "New token pair",
            content: { "application/json": { schema: { type: "object", properties: { accessToken: { type: "string" }, refreshToken: { type: "string" } } } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke the refresh token (doesn't fail if already revoked)",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: { "204": { description: "Session closed" } },
      },
    },
    "/channels": {
      get: {
        tags: ["Channels"],
        summary: "List the authenticated user's channels",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { channels: { type: "array", items: { $ref: "#/components/schemas/Channel" } } } } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Channels"],
        summary: "Create a channel (the creator automatically becomes a member)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } } } },
        },
        responses: {
          "201": { description: "Channel created", content: { "application/json": { schema: { type: "object", properties: { channel: { $ref: "#/components/schemas/Channel" } } } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/channels/{channelId}/messages": {
      get: {
        tags: ["Messages"],
        summary: "A channel's history, paginated by keyset (no OFFSET)",
        parameters: [
          { name: "channelId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "cursorCreatedAt", in: "query", schema: { type: "string", format: "date-time" }, description: "Must be sent together with cursorId" },
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
        summary: "Send a message (you must be a member of the channel)",
        parameters: [{ name: "channelId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string", minLength: 1, maxLength: 4000 } } } } },
        },
        responses: {
          "201": { description: "Message sent", content: { "application/json": { schema: { type: "object", properties: { message: { $ref: "#/components/schemas/Message" } } } } } },
          "403": { $ref: "#/components/responses/Forbidden" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/messages/read-receipts": {
      post: {
        tags: ["Messages"],
        summary: "Mark messages as read",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["messageIds"], properties: { messageIds: { type: "array", items: { type: "string", format: "uuid" } } } } } },
        },
        responses: { "204": { description: "Marked" } },
      },
    },
    "/messages/{messageId}": {
      patch: {
        tags: ["Messages"],
        summary: "Edit your own message (or anyone's if you're an admin)",
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string", minLength: 1, maxLength: 4000 } } } } },
        },
        responses: {
          "200": { description: "Message edited", content: { "application/json": { schema: { type: "object", properties: { message: { $ref: "#/components/schemas/Message" } } } } } },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Messages"],
        summary: "Delete (soft delete) your own message, or anyone's if you're an admin",
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Deleted" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/copilot/ask": {
      post: {
        tags: ["Copilot"],
        summary: "Ask the AI copilot (RAG over the user's own channels)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 1, maxLength: 1000 } } } } },
        },
        responses: {
          "200": {
            description: "Copilot's answer",
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
