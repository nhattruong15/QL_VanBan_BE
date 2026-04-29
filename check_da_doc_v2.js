import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import User from './src/models/userModel.js';
import Organization from './src/models/organizationModel.js';
import Department from './src/models/departmentModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkSpecificDoc = async () => {
  await connectDB();
  try {
    const doc = await Document.findOne({ title: /DÁ/i }).sort({ createdAt: -1 });
    if (!doc) {
      console.log('không tìm thấy');
    } else {
      console.log('ATTACHMENTS_COUNT:' + (doc.attachments?.length || 0));
      if (doc.attachments) {
        doc.attachments.forEach(a => console.log('FILE:' + a.name));
      }
    }
    process.exit();
  } catch (error) {
    console.error('ERROR:' + error.message);
    process.exit(1);
  }
};

checkSpecificDoc();
