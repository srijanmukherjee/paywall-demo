import { Document, model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import { SALT_ROUNDS } from "../configuration";

export interface IUserAccount extends Document {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	verified: boolean;
	createdAt: Date;
	validatePassword: (password: string) => Promise<boolean>;
}

const userAccountSchema = new Schema<IUserAccount>(
	{
		email: {
			type: String,
			required: true,
			unique: true,
			createIndexes: { unique: true },
		},
		firstName: { type: String, required: true },
		lastName: { type: String, required: true },
		password: { type: String, required: true, minlength: 8 },
		verified: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

userAccountSchema.pre("save", function (next) {
	const thisObj = this as unknown as IUserAccount;
	if (!thisObj.isModified("password")) return next();

	bcrypt.genSalt(SALT_ROUNDS, (err, salt) => {
		if (err) return next(err);

		bcrypt.hash(thisObj.password, salt, (err, hash) => {
			if (err) return next(err);
			thisObj.password = hash;
			next();
		});
	});
});

userAccountSchema.methods.validatePassword = async function (password: string) {
	const thisObj = this as unknown as IUserAccount;
	return bcrypt.compare(password, thisObj.password);
};

const UserAccount = model<IUserAccount>("UserAccount", userAccountSchema);

export default UserAccount;
