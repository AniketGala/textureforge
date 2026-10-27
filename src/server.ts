import "dotenv/config";
import { app } from "./app";
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.listen(port, host, () => console.log(`TextureForge API listening on ${host}:${port}`));
