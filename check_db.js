import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Department from './src/models/departmentModel.js';
import Organization from './src/models/organizationModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

const checkDB = async () => {
  await connectDB();
  try {
    const orgs = await Organization.find();
    console.log('Organizations:');
    orgs.forEach(o => console.log(`- ${o.name} (${o._id})`));

    const depts = await Department.find();
    console.log('\nDepartments:');
    depts.forEach(d => console.log(`- ${d.name} (Org: ${d.organization})`));

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

checkDB();
