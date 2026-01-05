// src/main.ts
// Enable CORS so the Next.js frontend (port 3001) can call the NestJS API (port 3000).

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow calls from the frontend dev server
  app.enableCors({
    origin: [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3000",
    ],
    credentials: true,
  });

  await app.listen(3000);
}
bootstrap();
