import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as admin from "firebase-admin";

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        "Firebase credentials not set — push notifications disabled"
      );
      return;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }

    this.initialized = true;
    this.logger.log("Firebase Admin SDK initialized");
  }

  isReady() {
    return this.initialized;
  }

  // Send to a single FCM token. Returns true on success, false on invalid token.
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<"ok" | "invalid_token" | "error"> {
    if (!this.initialized) return "error";

    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: "high",
          notification: { channelId: "rupexo_default", sound: "default" },
        },
      });
      return "ok";
    } catch (err: any) {
      const code = err?.errorInfo?.code as string | undefined;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        return "invalid_token";
      }
      this.logger.error(`FCM send error: ${code ?? err?.message}`);
      return "error";
    }
  }

  // Send to multiple tokens, returns list of invalid tokens to clean up.
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<string[]> {
    if (!this.initialized || tokens.length === 0) return [];

    const invalidTokens: string[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        const result = await this.sendToToken(token, title, body, data);
        if (result === "invalid_token") invalidTokens.push(token);
      })
    );

    return invalidTokens;
  }
}
