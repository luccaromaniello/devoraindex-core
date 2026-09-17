import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp({ publicUrl: config.PUBLIC_URL });

serve(
	{
		fetch: app.fetch,
		hostname: config.HOST,
		port: config.PORT,
	},
	(info) => {
		console.log(`DevoraIndex Core listening on http://${config.HOST}:${info.port}`);
	},
);
