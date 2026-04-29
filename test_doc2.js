import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './src/models/documentModel.js';
import User from './src/models/userModel.js';
import Organization from './src/models/organizationModel.js';

dotenv.config();

const test = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster0.nvyleg4.mongodb.net/quanlyvanban?retryWrites=true&w=majority&appName=Cluster0');
    
    // Pick an employee
    const employee = await User.findOne({ role: 'EMPLOYEE' });
    const leader = await User.findOne({ role: 'LEADER', organization: employee.organization });
    
    if (!employee || !leader) {
      console.log('Could not find employee and leader in the same org to test.');
      process.exit();
    }
    
    console.log(`Testing with Employee: ${employee._id} and Leader: ${leader._id} in Org: ${employee.organization}`);
    
    // Simulate createDocument Controller logic
    const status = 'SENT';
    const receiverOrgId = employee.organization.toString(); // internal
    
    const isInternal = (status === 'SENT' && employee.organization.toString() === receiverOrgId);
    
    const finalStatus = isInternal ? 'FORWARDED' : (status || 'DRAFT');
    
    console.log(`Original Status: ${status}, Receiver Org: ${receiverOrgId}, Is Internal: ${isInternal}, Final Status: ${finalStatus}`);
    
    // Let's create it in DB to see what happens
    const doc = await Document.create({
      title: 'TEST DOCUMENT',
      content: 'This is a test document',
      type: 'EXPRESS',
      sender: {
        user: employee._id,
        organization: employee.organization,
        department: employee.department,
      },
      receiver: {
        organization: employee.organization,
        targetLeader: leader._id
      },
      status: finalStatus,
      history: [{
        user: employee._id,
        action: 'CREATED',
        note: 'Test'
      }]
    });
    
    console.log(`Document created with status: ${doc.status}`);
    
    await Document.findByIdAndDelete(doc._id);
    console.log('Test completed and cleaned up.');
  } catch (err) {
    console.error(err);
  }
  process.exit();
};

test();
