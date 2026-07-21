import "dotenv/config";
import { serve } from "@hono/node-server";

import { getDataProvider } from "../providers/index.js";
import { createApp } from "./app.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const provider = getDataProvider(config.dataProvider);
const app = createApp(provider, config);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `Zacca Credit Intelligence API (x402/${config.network})`,
  );
  console.log(`  provider:    ${provider.name}`);
  console.log(`  facilitator: ${config.facilitatorUrl}`);
  console.log(`  payTo:       ${config.payToAccount}`);
  console.log(`  listening:   http://localhost:${info.port}`);
  console.log(`  catalog:     http://localhost:${info.port}/catalog`);
});
