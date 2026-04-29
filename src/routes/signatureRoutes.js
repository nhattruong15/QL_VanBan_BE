import express from 'express';
const router = express.Router();

import {
  generateOrgKeyPair,
  signDoc,
  verifyDocSignature,
  getOrgPublicKey,
  getDocSignatureStatus,
} from '../controllers/signatureController.js';
import { protect } from '../middleware/authMiddleware.js';

// Tạo cặp khóa RSA cho tổ chức hiện tại (Admin thực hiện 1 lần)
router.post('/generate-keys', protect, generateOrgKeyPair);

// Ký văn bản (tổ chức gửi ký trước khi gửi đi)
router.post('/sign/:documentId', protect, signDoc);

// Xác minh chữ ký (tổ chức nhận xác minh sau khi nhận văn bản)
router.post('/verify/:documentId', protect, verifyDocSignature);

// Lấy public key của một tổ chức bất kỳ
router.get('/public-key/:orgId', protect, getOrgPublicKey);

// Lấy trạng thái chữ ký của văn bản
router.get('/status/:documentId', protect, getDocSignatureStatus);

export default router;
