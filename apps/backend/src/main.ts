import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

/** Carica `apps/backend/.env` anche se il processo è avviato con cwd diversa (es. root monorepo). */
loadDotenv({ path: resolve(__dirname, "../.env"), quiet: true });

async function bootstrap(): Promise<void> {
  const defaultOrigins = [
    "http://localhost:3000",
    "https://payday-web.vercel.app",
    "https://payday-azi-rfmn.onrender.com"
  ];
  const corsOrigin = process.env.CORS_ORIGIN ?? defaultOrigins.join(",");
  const origins = corsOrigin
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = origins.length > 0 ? origins : defaultOrigins;

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const isExactMatch = allowedOrigins.includes(origin);
        const isRenderDomain = /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin);
        const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
        const isLocalhost = /^http:\/\/localhost:\d+$/i.test(origin);
        const allowed = isExactMatch || isRenderDomain || isVercelPreview || isLocalhost;
        callback(null, allowed);
      },
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "Authorization"],
      preflightContinue: false,
      optionsSuccessStatus: 204
    }
  });

  app.use(json({ limit: "12mb" }));
  app.use(urlencoded({ extended: true, limit: "12mb" }));

  const http = app.getHttpAdapter().getInstance();
  http.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void
    ) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
      next();
    }
  );
  http.get("/", (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ status: "ok", service: "nexa-hr-backend", basePath: "/api" });
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
