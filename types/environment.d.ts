declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: "development" | "production";
			SERVER_PORT?: string;
			HOST: string;
			RESEND_API_KEY: string;
			MONGO_CONNECTION_URI: string;
			JWT_TOKEN_SECRET: string;
			JWT_EXPIRE: string;
		}
	}
}

export {};
