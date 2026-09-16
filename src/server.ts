import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
	{
		fetch: createApp().fetch,
		hostname,
		port,
	},
	(info) => {
		console.log(`DevoraIndex Core listening on http://${hostname}:${info.port}`);
	},
);
