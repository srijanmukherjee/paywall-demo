import { Schema, model, Document } from "mongoose";

interface IResourceTransaction extends Document {
	resourceId: string;
	uid: string;
	credits: number;
	createdAt: Date;
}

const ResourceTransactionSchema = new Schema<IResourceTransaction>(
	{
		resourceId: {
			type: String,
			required: true,
			index: true,
		},
		uid: {
			type: String,
			required: true,
			index: true,
		},
		credits: {
			type: Number,
			rquired: true,
		},
	},
	{ timestamps: true }
);

ResourceTransactionSchema.index(
	{
		resourceId: 1,
		uid: 1,
	},
	{ unique: true }
);

const ResourceTransactionModel = model<IResourceTransaction>("ResourceTransaction", ResourceTransactionSchema);

export default ResourceTransactionModel;
