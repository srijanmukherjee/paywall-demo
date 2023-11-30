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
import { isEmail, isString } from "class-validator";
import CreditPackage from "./models/creditPackage";
import { currencyList } from "./currencies";
import UserCredits from "./models/userCredits";
import Stripe from "stripe";
import CreditTransaction from "./models/creditTransaction";
import mongoose from "mongoose";
import ResourceModel, { IResourceData } from "./models/resource";
import ResourceTransactionModel from "./models/resourceTransaction";

const port = process.env.SERVER_PORT || DEFAULT_PORT;
const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
	typescript: true,
});

app.use(morgan("combined"));

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
	// Retrieve the event by verifying the signature using the raw body and secret.
	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"] as string, process.env.STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		console.log(`⚠️  Webhook signature verification failed.`);
		res.sendStatus(400);
		return;
	}

	const data: Stripe.Event.Data = event.data;
	const eventType: string = event.type;

	// TODO: handle failed payment
	if (eventType === "checkout.session.completed") {
		const session: Stripe.Checkout.Session = data.object as Stripe.Checkout.Session;

		try {
			const transaction = await CreditTransaction.findOne({ checkoutId: session.id });
			if (!transaction) {
				// We don't know who paid this
				// TODO: refund
				throw new Error("Paid but transaction does not exist");
			}

			const userExists = await UserAccount.exists({ _id: new mongoose.Types.ObjectId(transaction.uid) });
			if (!userExists) {
				// We don't know who this was paid for
				// TODO: refund
				throw new Error("Paid but transaction does not exist");
			}

			transaction.status = "succeded";
			await Promise.all([UserCredits.updateOne({ uid: transaction.uid }, { $inc: { credits: transaction.credits } }, { upsert: true }), transaction.save()]);
		} catch (err) {
			return res.sendStatus(401);
		}
	}

	res.sendStatus(200);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function resolve(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

async function authenticationHelper(req: Request): Promise<InstanceType<typeof UserAccount>> {
	const authHeader = req.get("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) throw new Error("No credentials");

	const token = authHeader.split(" ")[1];
	let payload;
	try {
		payload = jwt.verify(token, process.env.JWT_TOKEN_SECRET);

		if (typeof payload === "string") throw new Error();
	} catch (err) {
		throw new Error("Invalid token");
	}

	const { email } = payload;
	if (!email) throw new Error("Invalid payload");

	const user = await UserAccount.findOne({ email });
	if (!user) {
		throw new Error("Invalid token");
	}

	return user;
}

function authenticate(req: Request, res: Response, next: NextFunction) {
	authenticationHelper(req)
		.then((user) => {
			req.user = user;
			next();
		})
		.catch((err: Error) => {
			return res.status(401).json({ error: err.message });
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
		const { email, password }: { email: string; password: string } = req.body;

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
			email: req.user.email,
			firstName: req.user.firstName,
			lastName: req.user.lastName,
			verified: req.user.verified,
			createdAt: req.user.createdAt,
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
		const { oldPassword, newPassword }: { oldPassword: string; newPassword: string } = req.body;

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

app.get(
	"/account/credits",
	authenticate,
	resolve(async (req, res) => {
		const userCredits = await UserCredits.findOne({ uid: req.user._id });
		if (!userCredits) {
			return res.json({
				credits: 0,
				updatedAt: null,
			});
		}

		res.json({
			credits: userCredits.credits,
			updatedAt: userCredits.updatedAt,
		});
	})
);

app.get(
	"/packages",
	authenticate,
	resolve(async (req, res) => {
		const packages = await CreditPackage.find({});
		const packagesDto = packages.map((p) => ({ id: p.id, credits: p.credits, unit_amount: p.unit_amount, currency: p.currency, createdAt: p.createdAt }));
		res.json(packagesDto);
	})
);

// TODO: ensure user has admin privilege
app.post(
	"/packages",
	authenticate,
	/* authorize("admin"), */ resolve(async (req, res) => {
		const { credits, unit_amount, currency }: { credits: number; unit_amount: number; currency: string } = req.body;

		if (!credits) {
			throw new Error("credits is not provided");
		}

		if (!unit_amount) {
			throw new Error("unit_amount is not provided");
		}

		if (!currency) {
			throw new Error("currency is not provided");
		}

		if (!Number.isInteger(credits) || isNaN(credits)) {
			throw new Error("expected credits as integer");
		}

		if (credits <= 0) {
			throw new Error("credits must be atleast 1");
		}

		if (!Number.isInteger(unit_amount) || isNaN(unit_amount)) {
			throw new Error("expected unit_amount as integer");
		}

		if (unit_amount <= 0) {
			throw new Error("unit_amount must be atleast 1");
		}

		if (!currencyList.includes(currency)) {
			throw new Error("unsupported currency");
		}

		const creditPackage = await CreditPackage.create({
			id: uuidv4(),
			credits,
			unit_amount,
			currency,
		});

		res.json({
			id: creditPackage.id,
			credits: creditPackage.credits,
			unit_amount: creditPackage.unit_amount,
			currency: creditPackage.currency,
			createdAt: creditPackage.createdAt,
		});
	})
);

app.post(
	"/packages/buy",
	authenticate,
	resolve(async (req, res) => {
		const { id }: { id: string } = req.body;

		if (!id) {
			throw new Error("expected id");
		}

		if (!isString(id)) {
			throw new Error("expected id to be a string");
		}

		const creditPackage = await CreditPackage.findOne({ id });
		if (!creditPackage) {
			throw new Error("Package not found");
		}

		const session = await stripe.checkout.sessions.create({
			line_items: [
				{
					price_data: {
						currency: creditPackage.currency,
						product_data: {
							name: `${creditPackage.credits} credits`,
						},
						unit_amount: creditPackage.unit_amount,
					},
					quantity: 1,
				},
			],
			mode: "payment",
			success_url: `${process.env.HOST}/payment-success`,
			cancel_url: `${process.env.HOST}/payment-cancel`,
			customer_email: req.user.email,
		});

		if (!session.url) {
			await stripe.checkout.sessions.expire(session.id);
			throw new Error("Failed to start checkout process");
		}

		try {
			await CreditTransaction.create({
				checkoutId: session.id,
				uid: req.user._id,
				credits: creditPackage.credits,
				unit_amount: creditPackage.unit_amount,
				currency: creditPackage.currency,
				quantity: 1,
				status: "pending",
			});

			if (process.env.NODE_ENV === "development") {
				res.json({
					sessionUrl: session.url,
				});
			} else {
				res.redirect(session.url);
			}
		} catch (err) {
			await stripe.checkout.sessions.expire(session.id);
			throw new Error("Failed to start checkout process");
		}
	})
);

app.get("/payment-success", (req, res) => {
	res.json({
		message: "Success",
	});
});

app.get(
	"/packages/transactions",
	authenticate,
	resolve(async (req, res) => {
		const transactions = await CreditTransaction.find({ uid: req.user._id });
		const transactionsDto = transactions.map((t) => ({
			id: t._id,
			credits: t.credits,
			unit_amount: t.unit_amount,
			currency: t.currency,
			createdAt: t.createdAt,
			status: t.status,
			checkout_id: t.checkoutId,
		}));
		res.json(transactionsDto);
	})
);

// TODO
app.get("/packages/transactions/:id", (req, res) => {
	res.json({
		message: "Not implemented",
	});
});

app.get(
	"/resources",
	resolve(async (req, res) => {
		const resources = await ResourceModel.find({});
		const resourcesDto = resources.map((r) => ({
			id: r.id,
			cost: r.cost,
			name: r.name,
			description: r.description,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		}));
		res.json(resourcesDto);
	})
);

// TODO: authorize
app.post(
	"/resources",
	authenticate,
	/* authorize("admin"),*/ resolve(async (req, res) => {
		const { cost, name, description, data }: { cost: number; name: string; description?: string; data: IResourceData } = req.body;

		if (cost === undefined || cost === null) {
			throw new Error("resource cost is required");
		}

		if (isString(cost) || isNaN(cost) || !Number.isInteger(cost)) {
			throw new Error("expected cost to be a number");
		}

		if (cost < 0) {
			throw new Error("cost must be >= 0");
		}

		if (!name) {
			throw new Error("resource name is required");
		}

		if (!isString(name)) {
			throw new Error("resource name must be a string");
		}

		if (name.length < 5) {
			throw new Error("resource name must be atleast 5 characters long");
		}

		if (description && !isString(description)) {
			throw new Error("resource description must be a string");
		}

		if (!data) {
			throw new Error("resource data is required");
		}

		if (!data.title) {
			throw new Error("resource data title is missing");
		}

		if (!isString(data.title)) {
			throw new Error("resource datat title must be string");
		}

		if (!data.content) {
			throw new Error("resource data content is missing");
		}

		if (!isString(data.content)) {
			throw new Error("resouce data content must be a string");
		}

		const resource = await ResourceModel.create({
			cost,
			name,
			description,
			data,
		});

		return res.json({
			id: resource.id,
			cost: resource.cost,
			name: resource.name,
			description: resource.description,
			data: resource.data,
			createdAt: resource.createdAt,
			updatedAt: resource.updatedAt,
		});
	})
);

app.get(
	"/resources/:id",
	resolve(async (req, res) => {
		const id = req.params.id as string;

		const resource = await ResourceModel.findOne({ id });
		if (!resource) {
			res.status(404);
			throw new Error("Resource not found");
		}

		if (resource.cost === 0) {
			return res.json({
				id: resource.id,
				cost: resource.cost,
				name: resource.name,
				description: resource.description,
				data: resource.data,
				createdAt: resource.createdAt,
				updatedAt: resource.updatedAt,
			});
		} else {
			await authenticationHelper(req)
				.then(async (user) => {
					const transaction = await ResourceTransactionModel.findOne({
						resourceId: resource.id,
						uid: user.id,
					});

					if (!transaction) {
						throw new Error("User doesn't have access to this resource. Consider buying");
					}

					return res.json({
						id: resource.id,
						cost: resource.cost,
						name: resource.name,
						data: resource.data,
						description: resource.description,
						createdAt: resource.createdAt,
						updatedAt: resource.updatedAt,
					});
				})
				.catch(() => {
					return res.json({
						id: resource.id,
						cost: resource.cost,
						name: resource.name,
						description: resource.description,
						createdAt: resource.createdAt,
						updatedAt: resource.updatedAt,
					});
				});
		}
	})
);

// TODO: separate user bought items and the transaction itself
app.post(
	"/resources/:id/buy",
	authenticate,
	resolve(async (req, res) => {
		const id = req.params.id as string;
		const resource = await ResourceModel.findOne({ id });
		if (!resource) {
			res.status(404);
			throw new Error("Resource not found");
		}

		// check if already bought
		const alreadyBought = await ResourceTransactionModel.exists({ resourceId: id, uid: req.user.id });
		if (alreadyBought) {
			return res.json({
				message: "Already bought",
			});
		}

		const userCredits = await UserCredits.findOne({ uid: req.user.id });

		// make sure user has enough credits
		if (!userCredits || userCredits.credits < resource.cost) {
			return res.json({
				message: "Not enough balance",
			});
		}

		const transaction = await ResourceTransactionModel.create({
			resourceId: resource.id,
			uid: req.user.id,
			credits: resource.cost,
		});

		if (!transaction) {
			throw new Error("Transaction failed");
		}

		try {
			await UserCredits.updateOne(
				{ uid: req.user.id },
				{
					$inc: {
						credits: -resource.cost,
					},
				},
				{
					runValidators: true,
				}
			);
		} catch (err) {
			throw new Error("Transaction failed");
		}

		return res.json(transaction);
	})
);

app.get(
	"/transactions",
	authenticate,
	resolve(async (req, res) => {
		const transactions = await ResourceTransactionModel.find({ uid: req.user.id });
		const transactionDto = transactions.map((t) => ({
			tnx_id: t.id,
			resourceId: t.resourceId,
			credits: t.credits,
			createdAt: t.createdAt,
		}));
		res.json(transactionDto);
	})
);

app.use((err: any, req: Request, res: Response, next: any) => {
	let error: any = "Something went wrong";
	if (err.message?.length) {
		error = err.message;
	}
	const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
	res.status(statusCode).json({
		error,
		statusCode,
	});
	next();
});

app.listen(port, () => {
	console.log(`server running on http://127.0.0.1:${port}`);
});
