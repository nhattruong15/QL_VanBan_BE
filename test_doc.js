import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';

dotenv.config();

const test = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster0.nvyleg4.mongodb.net/quanlyvanban?retryWrites=true&w=majority&appName=Cluster0');
  
  // Find a draft internal document or just look at all documents sent recently to a leader
  const recentDocs = await Document.find({ type: { $in: ['EXPRESS', 'LEADER_SUBMIT'] } }).sort({ createdAt: -1 }).limit(3).lean();
  console.log("Recent internal docs:");
  console.dir(recentDocs, { depth: null });
  
  process.exit();
};

test();
