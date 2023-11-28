import { Document, Schema, model } from "mongoose";

interface IVerificationToken extends Document {
	token: string;
	expiresAt: Date;
	uuid: string;
	emailDelivered: boolean;
}

const verficationTokenSchema = new Schema<IVerificationToken>(
	{
		token: {
			type: String,
			required: true,
			unique: true,
			createIndexes: { unique: true },
		},
		uuid: {
			type: String,
			required: true,
		},
		emailDelivered: {
			type: Boolean,
			default: false,
		},
		expiresAt: Date,
	},
	{ timestamps: true }
);

verficationTokenSchema.index(
	{
		expiresAt: 1,
	},
	{ expireAfterSeconds: 0 }
);

const VerificationToken = model<IVerificationToken>(
	"VerficationToken",
	verficationTokenSchema
);

export default VerificationToken;
