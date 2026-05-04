import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import Document from './src/models/documentModel.js';

dotenv.config();

const clearDocuments = async () => {
  try {
    await connectDB();
    
    console.log('Đang xóa toàn bộ văn bản...');
    const result = await Document.deleteMany({});
    
    console.log(`Đã xóa thành công ${result.deletedCount} văn bản!`);
    
    process.exit();
  } catch (error) {
    console.error('Lỗi khi xóa văn bản:', error);
    process.exit(1);
  }
};

clearDocuments();
