import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import userRoutes from './src/routes/userRoutes.js';
import documentRoutes from './src/routes/documentRoutes.js';
import departmentRoutes from './src/routes/departmentRoutes.js';
import organizationRoutes from './src/routes/organizationRoutes.js';
import signatureRoutes from './src/routes/signatureRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';

import path from 'path';

dotenv.config();

// kết nối data với moogo ở đây
connectDB();

const app = express();
const __dirname = path.resolve();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// Routes(url kết nối api)
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
  res.send('API đang kết nối với mongoDB...');
});

//  (xử lý lỗi)
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server đang chạy ở ${process.env.NODE_ENV} mode ở cổng ${PORT}`);
});
