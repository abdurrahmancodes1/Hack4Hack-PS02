import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGO_DB_NAME || "hack4hack_db";

  try {
    await mongoose.connect(uri, {
      dbName,
    });
    console.log(`Connected to MongoDB [database: ${dbName}]`);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
}
