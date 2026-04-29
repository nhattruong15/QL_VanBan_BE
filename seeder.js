import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/userModel.js';
import Organization from './src/models/organizationModel.js';
import Department from './src/models/departmentModel.js';
import connectDB from './src/config/db.js';

dotenv.config();

connectDB();

const importData = async () => {
  try {
    await User.deleteMany();
    await Department.deleteMany();
    await Organization.deleteMany();

    const org1 = await Organization.create({
      name: 'Bộ Tư Pháp',
      code: 'BTP',
      address: '60 Trần Phú, Hà Nội',
      phone: '024.62739718',
      email: 'cntt@moj.gov.vn',
    });

    const org2 = await Organization.create({
      name: 'Cục Công Nghệ Thông Tin',
      code: 'CCNTT',
      address: 'Hà Nội',
    });

    const dep1 = await Department.create({
      name: 'Phòng Hành chính - Tổ chức',
      code: 'HCTC_BTP',
      organization: org1._id,
    });
    
    const dep2 = await Department.create({
      name: 'Phòng Kế hoạch - Tài chính',
      code: 'KHTC_BTP',
      organization: org1._id,
    });

    const dep3 = await Department.create({
      name: 'Phòng Phần mềm',
      code: 'PM_CCNTT',
      organization: org2._id,
    });

    await User.create([
      {
        name: 'Quản trị viên toàn hệ thống',
        username: 'superadmin',
        password: 'password123',
        role: 'SUPER_ADMIN',
      },
      {
        name: 'Phạm Quang Hiếu',
        username: 'admin',
        password: 'password123',
        role: 'ADMIN',
        organization: org1._id,
      },
      {
        name: 'Trần Duy Minh (Nhân viên KHTC)',
        username: 'minhtd',
        password: 'password123',
        role: 'EMPLOYEE',
        organization: org1._id,
        department: dep2._id,
      },
      {
        name: 'Văn Thư Một',
        username: 'vanthu',
        password: 'password123',
        role: 'DISPATCHER',
        organization: org1._id,
      },
      {
        name: 'Lãnh Đạo Một',
        username: 'lanhdao',
        password: 'password123',
        role: 'LEADER',
        organization: org1._id,
      },
      {
        name: 'Văn Thư Cục CNTT',
        username: 'cntt_vanthu',
        password: 'password123',
        role: 'DISPATCHER',
        organization: org2._id,
      },
      {
        name: 'Nhân Viên Phòng Phần Mềm',
        username: 'cntt_nv',
        password: 'password123',
        role: 'EMPLOYEE',
        organization: org2._id,
        department: dep3._id,
      }
    ]);

    console.log('Data Imported!');
    process.exit();
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
};

if (process.argv[2] === '-d') {
} else {
  importData();
}
