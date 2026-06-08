import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true });
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
bootstrap();
