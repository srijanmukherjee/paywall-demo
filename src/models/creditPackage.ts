import { Document, Schema, model } from "mongoose";
import Currency from "../currencies";

export interface ICreditPackage extends Document {
	id: string;
	credits: number;
	unit_amount: number;
	currency: Currency;
	createdAt: Date;
}

const creditPackageSchame = new Schema<ICreditPackage>(
	{
		id: {
			type: String,
			required: true,
			index: { unique: true },
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
	},
	{ timestamps: true }
);

const CreditPackage = model<ICreditPackage>("CreditPackage", creditPackageSchame);

export default CreditPackage;
