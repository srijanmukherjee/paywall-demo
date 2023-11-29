import { Document, Schema, model } from "mongoose";
import Currency from "../currencies";

interface ICreditTransaction extends Document {
	checkoutId: string;
	uid: string;
	status: "pending" | "expired" | "succeded";
	credits: number;
	unit_amount: number;
	currency: Currency;
	quantity: number;
	createdAt: Date;
	updatedAt: Date;
}

const creditTransactionSchema = new Schema<ICreditTransaction>(
	{
		checkoutId: {
			type: String,
			required: true,
			index: { unique: true },
		},
		uid: {
			type: String,
			required: true,
		},
		status: {
			type: String,
			default: "pending",
		},
		credits: {
			type: Number,
			required: true,
		},
		unit_amount: {
			type: Number,
			required: true,
		},
		currency: {
			type: String,
			required: true,
		},
		quantity: {
			type: Number,
			required: true,
		},
	},
	{ timestamps: true }
);

creditTransactionSchema.index(
	{
		uid: 1,
		checkoutId: 1,
	},
	{ unique: true }
);

const CreditTransaction = model<ICreditTransaction>("CreditTransaction", creditTransactionSchema);

export default CreditTransaction;
