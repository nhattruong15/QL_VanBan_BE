import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import Organization from './src/models/organizationModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const test = async () => {
  await connectDB();
  try {
    const org = await Organization.findOne();
    if (!org) {
      console.log('No organizations found!');
      process.exit();
    }
    const orgId = org._id.toString();
    console.log(`Testing with Org: ${org.name} (${orgId})`);
    
    const url = `http://localhost:5000/api/departments/test/${orgId}`;
    console.log(`Requesting: ${url}`);
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('API Response Status:', res.statusCode);
        console.log('API Response Body:', data);
        process.exit();
      });
    }).on('error', (err) => {
      console.error('API Request Error:', err.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Test script error:', error.message);
    process.exit(1);
  }
};

test();
