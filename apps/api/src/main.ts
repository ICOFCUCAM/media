import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { httpMetrics } from "./health/http-metrics";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Every route is /v1/…; probes and metrics stay at the root for the platform.
  app.setGlobalPrefix("v1", { exclude: ["livez", "readyz", "metrics"] });
  app.use(httpMetrics);
  app.enableCors({ origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true });
  app.enableShutdownHooks();
  // Render / DeployPro set PORT; API_PORT for local runs.
  await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 4000), "0.0.0.0");
}
bootstrap();
