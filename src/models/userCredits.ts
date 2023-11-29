import { Document, Schema, model } from "mongoose";

interface IUserCredits extends Document {
	uid: string;
	credits: number;
	updatedAt: Date;
}

const userCcreditsSchama = new Schema<IUserCredits>(
	{
		uid: { type: String, required: true, index: { unique: true } },
		credits: { type: Number, required: true },
	},
	{ timestamps: true }
);

const UserCredits = model<IUserCredits>("UserCredits", userCcreditsSchama);

export default UserCredits;
