import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import Organization from './src/models/organizationModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkDocs = async () => {
  await connectDB();
  try {
    const docs = await Document.find()
      .populate('sender.organization', 'name')
      .populate('receiver.organization', 'name')
      .sort({ createdAt: -1 })
      .limit(5);
      
    if (docs.length === 0) {
      console.log('No documents found in database.');
    } else {
      console.log('Recent Documents:');
      docs.forEach(d => {
        console.log(`- Title: ${d.title}`);
        console.log(`  Sender Org: ${d.sender?.organization?.name || 'Unknown'}`);
        console.log(`  Receiver Org: ${d.receiver?.organization?.name || 'Unknown'}`);
        console.log(`  Status: ${d.status}`);
        console.log(`  CreatedAt: ${d.createdAt}`);
      });
    }
    process.exit();
  } catch (error) {
    console.error('Test Error:', error.message);
    process.exit(1);
  }
};

checkDocs();
