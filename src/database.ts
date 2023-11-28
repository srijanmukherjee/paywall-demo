import mongoose from "mongoose";

mongoose
	.connect(process.env.MONGO_CONNECTION_URI, {
		minPoolSize: 10,
	})
	.then(() => {
		console.log("Opened connection to mongodb");
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
