import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkDocDetails = async () => {
  await connectDB();
  try {
    const docs = await Document.find()
      .populate('sender.organization', 'name')
      .populate('receiver.organization', 'name')
      .sort({ createdAt: -1 })
      .limit(1);
      
    if (docs.length === 0) {
      console.log('No documents found.');
    } else {
      const d = docs[0];
      console.log('--- LATEST DOCUMENT DETAILS ---');
      console.log(`Title: ${d.title}`);
      console.log(`Status: ${d.status}`);
      console.log(`Attachments Count: ${d.attachments?.length || 0}`);
      if (d.attachments && d.attachments.length > 0) {
        d.attachments.forEach((a, i) => {
          console.log(`  [${i}] ${a.name} -> ${a.path}`);
        });
      }
      console.log(`Receiver Dept: ${d.receiver?.department || 'NONE'}`);
    }
    process.exit();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkDocDetails();
