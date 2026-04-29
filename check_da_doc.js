import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkSpecificDoc = async () => {
  await connectDB();
  try {
    const doc = await Document.findOne({ title: /DÁ/i })
      .sort({ createdAt: -1 });
      
    if (!doc) {
      console.log('Document not found with title matching "DÁ"');
    } else {
      console.log('--- DOCUMENT FOUND ---');
      console.log(`ID: ${doc._id}`);
      console.log(`Title: ${doc.title}`);
      console.log(`Attachments (Raw):`, JSON.stringify(doc.attachments, null, 2));
      console.log(`Req Body used during creation (Partial): Title=${doc.title}, Content=${doc.content}`);
    }
    process.exit();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkSpecificDoc();
