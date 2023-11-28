import "reflect-metadata";

import dotenv from "dotenv";
dotenv.config();

import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";
import jwt from "jsonwebtoken";

import "./database";
import { ACCOUNT_VERIFICATION_TOKEN_TTL, DEFAULT_PORT } from "./configuration";
import { sendVerificationEmail } from "./service/email";
import VerificationToken from "./models/verificationToken";
import UserAccount from "./models/userAccount";
import { isEmail } from "class-validator";

const port = process.env.SERVER_PORT || DEFAULT_PORT;
const app = express();

app.use(express.json());
app.use(morgan("combined"));

app.get("/", (req, res) => {
	res.json({
		message: "Hello from server",
	});
});

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		export interface Request {
			user: InstanceType<typeof UserAccount>;
		}
	}
}

function resolve(
	fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

function authenticate(req: Request, res: Response, next: NextFunction) {
	const authHeader = req.get("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer "))
		return res.status(401).json({ error: "No credentials" });

	const token = authHeader.split(" ")[1];
	let payload;
	try {
		payload = jwt.verify(token, process.env.JWT_TOKEN_SECRET);

		if (typeof payload === "string")
			return res.status(403).json({ error: "Invalid payload" });
	} catch (err) {
		return res.status(403).json({ error: "Invalid token" });
	}

	const { email } = payload;
	if (!email) return res.status(403).json({ error: "Invalid payload" });

	UserAccount.findOne({ email })
		.then((user) => {
			if (!user) {
				return res.status(403).json({ error: "Invalid token" });
			}
			req.user = user;
			next();
		})
		.catch(() => {
			return res.status(403).json({ error: "Invalid token" });
		});
}

app.post(
	"/signup",
	resolve(async (req, res) => {
		const user = await UserAccount.create(req.body);
		const verificationToken = await VerificationToken.create({
			token: uuidv4(),
			uuid: user._id,
			expiresAt: moment().add(ACCOUNT_VERIFICATION_TOKEN_TTL),
		});

		// TODO: handle email sending errors
		sendVerificationEmail(user, verificationToken.token)
			.then(() => {
				verificationToken.emailDelivered = true;
				verificationToken.save();
			})
			.catch(console.error);

		return res.json({
			user: {
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				createdAt: user.createdAt,
				verified: user.verified,
			},
		});
	})
);

app.post(
	"/login",
	resolve(async (req, res) => {
		const { email, password }: { email: string; password: string } =
			req.body;

		if (!email) {
			throw new Error("email is required");
		}

		if (!password) {
			throw new Error("password is required");
		}

		if (!isEmail(email)) {
			throw new Error("provided email is not a valid email");
		}

		const user = await UserAccount.findOne({ email });
		if (!user) {
			throw new Error("Invalid email or password");
		}

		const result = await user.validatePassword(password);
		if (!result) {
			throw new Error("Invalid email or password");
		}

		const token = await jwt.sign(
			{
				email: user.email,
			},
			process.env.JWT_TOKEN_SECRET,
			{
				expiresIn: process.env.JWT_EXPIRE,
			}
		);

		res.json({
			token,
		});
	})
);

app.get(
	"/account",
	authenticate,
	resolve(async (req, res) => {
		res.json({
			user: {
				email: req.user.email,
				firstName: req.user.firstName,
				lastName: req.user.lastName,
				verified: req.user.verified,
				createdAt: req.user.createdAt,
			},
		});
	})
);

app.get(
	"/verify-account/:token",
	resolve(async (req, res) => {
		const token = req.params.token as string;
		const verificationToken = await VerificationToken.findOne({ token });
		if (verificationToken === null) {
			throw new Error("Token does not exist");
		}

		const user = await UserAccount.findById(verificationToken.uuid);
		if (user === null) {
			throw new Error("User does not exist");
		}

		if (user.verified) {
			throw new Error("User already verified");
		}

		user.verified = true;
		await user.save();

		res.json({
			message: "Account is successfully verified",
		});
	})
);

app.put(
	"/account/password",
	authenticate,
	resolve(async (req, res) => {
		const {
			oldPassword,
			newPassword,
		}: { oldPassword: string; newPassword: string } = req.body;

		if (!oldPassword) {
			throw new Error("old password is required");
		}

		if (!newPassword) {
			throw new Error("new password is required");
		}

		const result = await req.user.validatePassword(oldPassword);
		if (!result) {
			throw new Error("incorrect old password");
		}

		req.user.password = newPassword;
		await req.user.save();

		res.json({
			message: "Password changed successfully",
		});
	})
);

// frontend endpoint
app.get("/forgot-password", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

// email endpoint
app.put("/reset-password/:token", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.get("/account/credits", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.post("/credits/buy", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.get("/resources", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.get("/resources/:id", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.post("/resources/:id/buy", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.use((err: any, req: Request, res: Response, next: any) => {
	let error: any = "Something went wrong";
	if (err.message?.length) {
		error = err.message;
	}
	res.status(500).json({
		error,
		statusCode: 500,
	});
	next();
});

app.listen(port, () => {
	console.log(`server running on http://127.0.0.1:${port}`);
});
