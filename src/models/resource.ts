import { Schema, model, Document } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// Define your custom resource data here
export interface IResourceData extends Document {
	title: string;
	content: string;
}

interface IResource extends Document {
	id: string;
	cost: number;
	name: string;
	description?: string;
	data: IResourceData;
	createdAt: Date;
	updatedAt: Date;
}

const ResourceDataSchema = new Schema<IResourceData>({
	title: {
		type: String,
		required: true,
	},
	content: {
		type: String,
		required: true,
	},
});

const ResourceSchema = new Schema<IResource>(
	{
		id: {
			type: String,
			default: uuidv4,
			required: true,
			index: { unique: true },
		},

		cost: {
			type: Number,
			required: true,
			default: 0,
			min: 0,
		},

		name: {
			type: String,
			required: true,
		},

		description: String,

		data: {
			type: ResourceDataSchema,
			required: true,
		},
	},
	{ timestamps: true }
);

const ResourceModel = model<IResource>("Resource", ResourceSchema);

export default ResourceModel;
