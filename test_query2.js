import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import User from './src/models/userModel.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/qlvb_db').then(async () => {
  console.log('Connected to DB');
  
  const user = await User.findOne({ name: 'Trần Văn B' }); // Leader of Company A
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }
  
  console.log('User:', user.name, user.role, user.leaderLevel, user.organization);
  
  // Find the exact document "gửi lãnh đạo"
  const docs = await Document.find({ content: { $regex: /gửi lãnh đạo/i } }).sort({ createdAt: -1 }).limit(1).populate('receiver.targetLeader');
  console.log('\n--- DOCUMENT ---');
  if (docs.length === 0) {
    console.log('Document not found');
  } else {
    const doc = docs[0];
    console.log('Title:', doc.title);
    console.log('Content:', doc.content);
    console.log('Status:', doc.status);
    console.log('Type:', doc.type);
    console.log('Sender Org:', doc.sender.organization);
    console.log('Receiver Org:', doc.receiver.organization);
    console.log('Issuing Orgs:', doc.issuingOrganizations);
    console.log('Target Leader:', doc.receiver.targetLeader?._id, doc.receiver.targetLeader?.name);
    
    // Evaluate the query
    console.log('\n--- EVALUATING EXCLUSION CLAUSE ---');
    console.log('User org:', user.organization);
    const issuingOrgs = doc.issuingOrganizations.map(id => id.toString());
    console.log('is user.org in issuingOrgs?', issuingOrgs.includes(user.organization.toString()));
    
    const count = await Document.countDocuments({
      _id: doc._id,
      issuingOrganizations: { $elemMatch: { $ne: user.organization } }
    });
    console.log('Match $elemMatch $ne:', count > 0);
  }
  
  process.exit(0);
}).catch(console.error);
