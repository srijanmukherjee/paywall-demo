import moment, { unitOfTime } from "moment";

export const DEFAULT_PORT = 8000;
export const SALT_ROUNDS = 10;

const ttl_unit: unitOfTime.DurationConstructor =
	process.env.NODE_ENV === "development" ? "hour" : "minute";
export const ACCOUNT_VERIFICATION_TOKEN_TTL = moment.duration(1, ttl_unit);
