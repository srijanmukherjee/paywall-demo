import { Resend } from "resend";
import { v4 as uuidv4 } from "uuid";
import { IUserAccount } from "../models/userAccount";
import { ACCOUNT_VERIFICATION_TOKEN_TTL } from "../configuration";

const resend = new Resend(process.env.RESEND_API_KEY);
const host = process.env.HOST;

export function sendVerificationEmail(account: IUserAccount, token: string) {
	const url = `${host}/verify-account/${token}`;
	return resend.emails.send({
		from: "onboarding@resend.dev",
		to: account.email,
		subject: "Verify your account",
		headers: {
			// Prevents threading
			"X-Entity-Ref-ID": uuidv4(),
		},
		html: `Go to <a href='${url}'>${url}</a> to verify your account. This link will expire in ${ACCOUNT_VERIFICATION_TOKEN_TTL.humanize()}`,
	});
}
