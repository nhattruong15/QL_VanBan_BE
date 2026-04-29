import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import Organization from './src/models/organizationModel.js';
import User from './src/models/userModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkData = async () => {
  await connectDB();
  
  const orgs = await Organization.find();
  console.log('--- ORGANIZATIONS ---');
  orgs.forEach(o => console.log(`${o.name}: ${o._id}`));

  const docs = await Document.find().populate('sender.organization').populate('receiver.organization');
  console.log('\n--- DOCUMENTS ---');
  docs.forEach(d => {
    console.log(`Title: ${d.title}`);
    console.log(`Status: ${d.status}`);
    console.log(`Sender Org: ${d.sender.organization?.name} (${d.sender.organization?._id})`);
    console.log(`Receiver Org: ${d.receiver.organization?.name} (${d.receiver.organization?._id})`);
    console.log('---');
  });

  process.exit();
};

checkData();
