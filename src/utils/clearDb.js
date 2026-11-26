import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

async function clearDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitcore_saas';
  console.log(`Connecting to MongoDB at: ${uri}`);
  
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  console.log(`Dropping database: ${db.databaseName}...`);
  await db.dropDatabase();

  console.log(`Database "${db.databaseName}" dropped successfully. Database is now completely clean and empty.`);
  await mongoose.disconnect();
  process.exit(0);
}

clearDatabase().catch((err) => {
  console.error('Failed to clear database:', err);
  process.exit(1);
});
